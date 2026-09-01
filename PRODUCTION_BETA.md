# Beacon production beta rollout

## Required environment

Set these values in the ECS task definition (prefer AWS Secrets Manager for secrets):

- `APP_ENV=production`
- `DATABASE_URL=postgresql+psycopg2://...`
- `FRONTEND_URL=https://...`
- `BACKEND_URL=https://...`
- `SESSION_SECRET=<at least 32 random bytes>`
- `TOKEN_ENCRYPTION_KEY=<Fernet key>`
- `BEACON_ADMIN_EMAIL=you@example.com`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `OPENAI_API_KEY`
- Optional: `GMAIL_SYNC_WINDOW_DAYS=90`, `INSIGHT_SCORE_THRESHOLD=0.08`

Generate a Fernet key once and retain it in Secrets Manager:

```bash
python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'
```

Changing or losing this key makes encrypted Google credentials unreadable, so rotate it only with a deliberate token re-encryption process.

## Database rollout

Schema changes live in `backend/migrations/*.sql`. On startup, Beacon records applied versions in `schema_migrations` and takes a PostgreSQL transaction-scoped advisory lock. This makes concurrent ECS task startup safe. The first migration is additive: it does not drop or rename existing columns, and it preserves existing users by adding accounts already present in `user_settings` to the allowlist.

Recommended deployment order:

1. Take an RDS snapshot and verify `CREATE EXTENSION vector` is available.
2. Deploy one new ECS task and wait for its health check. It applies the migration transactionally.
3. Verify the `schema_migrations` row `001_production_beta` and the admin account in `allowed_users`.
4. Increase the desired task count / complete the rolling deployment.
5. Test login, sync, search, and disconnect with a beta account.

Do not edit an already-applied migration. Add a new numbered SQL file for every later schema change.

## Managing the allowlist

The backend enforces the allowlist after Google verifies the account and before Beacon creates a session. Requests require an authenticated session belonging to `BEACON_ADMIN_EMAIL`.

```bash
# List users
curl -b cookies.txt https://api.example.com/admin/allowed-users

# Invite or reactivate by email
curl -b cookies.txt -X POST https://api.example.com/admin/allowed-users \
  -H 'Content-Type: application/json' \
  -d '{"email":"person@example.com"}'

# Revoke (use the id returned by the list endpoint)
curl -b cookies.txt -X PATCH \
  https://api.example.com/admin/allowed-users/USER_ID/revoked

# Reactivate
curl -b cookies.txt -X PATCH \
  https://api.example.com/admin/allowed-users/USER_ID/active
```

Rejected attempts are logged as `invite_only_login_rejected` without storing a token or creating a session.

## Google OAuth scope rationale

Beacon requests only:

- `openid`: secure OpenID Connect authentication.
- `email`: retrieves the verified address used by the backend allowlist.
- `profile`: displays the user's name.
- `https://www.googleapis.com/auth/gmail.readonly`: reads message metadata and bodies for sync, indexing, and evidence links. Beacon does not request Gmail modify, send, or full-mailbox scopes.

Authlib validates OAuth state using the signed, secure session cookie. The callback URI is derived only from the server-controlled `BACKEND_URL`. Production disables OAuthlib's insecure-transport override. Disconnect revokes the Google grant when possible, removes both stored tokens, disables auto-sync, and clears the session.

For Google verification, configure the exact production callback (`BACKEND_URL/auth/callback`), homepage, privacy policy, terms, and authorized domains in Google Cloud Console.

## Search and indexing operations

`GET /indexing-status` exposes the most recent counts for emails listed, parsed, embedded, failed, and chunks indexed. `GET /sync-status/{job_id}` exposes the same per-job counters. Search merges semantic and keyword candidates with reciprocal-rank fusion; document and query vectors both use `text-embedding-3-small`.

Gmail's API is paginated up to the configured per-sync count and the sync window defaults to 90 days. MIME parsing handles nested plain-text and HTML-only messages. Gmail message resources are immutable, so already-indexed message IDs are not embedded repeatedly.

## Gmail links

All frontend links use the shared `gmailUrl` helper. RFC 822 Message-ID search links are preferred because Gmail universal links can open the installed mobile Gmail app and still target the specific message; the web URL is the fallback. Validate account-selection behavior on the target iOS and Android devices before public launch because the final app-opening choice is controlled by the OS and the user's Gmail installation.
