from contextlib import asynccontextmanager
from datetime import datetime, timedelta

from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, HTMLResponse

from starlette.middleware.sessions import SessionMiddleware

from pydantic import BaseModel

from apscheduler.schedulers.background import BackgroundScheduler

import threading
import uuid
import os
import base64
import json
import re
import hashlib
import logging
import requests as http_requests
from html import unescape
from html.parser import HTMLParser
from urllib.parse import urlparse, parse_qs

from collections import defaultdict
from email.utils import parseaddr

from sqlalchemy.orm import Session
from sqlalchemy import text, func, or_

from database import SessionLocal, engine, Base
from migrations import run_migrations
from retrieval import reciprocal_rank_fusion, search_terms
from gmail_links import gmail_web_url

from models import (
    Task, SyncJob, ProcessedEmail, EmailChunk, UserSettings,
    Notification, Insight, AllowedUser, InsightFeedback, IndexingStatus,
    OAuthState,
)

from ai_service import (
    analyze_email, generate_reply_draft, generate_insights,
    chunk_text, embed_text, generate_answer,
)

from dotenv import load_dotenv

from authlib.integrations.starlette_client import OAuth

from googleapiclient.discovery import build
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request as GoogleRequest

# Local development reads .env. AWS/ECS should inject environment variables
# through the task definition/Secrets Manager. A different file is only read
# when explicitly selected, preventing local runs from touching RDS by accident.
load_dotenv(os.getenv("BEACON_ENV_FILE", ".env"), override=False)

FRONTEND_URL = os.getenv("FRONTEND_URL")
BACKEND_URL = os.getenv("BACKEND_URL")
SESSION_SECRET = os.getenv("SESSION_SECRET")
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
BEACON_ADMIN_EMAIL = (os.getenv("BEACON_ADMIN_EMAIL") or "").strip().casefold()
TOKEN_ENCRYPTION_KEY = os.getenv("TOKEN_ENCRYPTION_KEY")
APP_ENV = os.getenv("APP_ENV", "development").lower()
SYNC_WINDOW_DAYS = int(os.getenv("GMAIL_SYNC_WINDOW_DAYS", "90"))

logger = logging.getLogger("beacon")

if APP_ENV == "production":
    missing = [name for name, value in {
        "DATABASE_URL": os.getenv("DATABASE_URL"),
        "FRONTEND_URL": FRONTEND_URL,
        "BACKEND_URL": BACKEND_URL,
        "SESSION_SECRET": SESSION_SECRET,
        "GOOGLE_CLIENT_ID": GOOGLE_CLIENT_ID,
        "GOOGLE_CLIENT_SECRET": GOOGLE_CLIENT_SECRET,
        "BEACON_ADMIN_EMAIL": BEACON_ADMIN_EMAIL,
        "TOKEN_ENCRYPTION_KEY": TOKEN_ENCRYPTION_KEY,
    }.items() if not value]
    if missing:
        raise RuntimeError(f"Missing required production environment: {', '.join(missing)}")

if APP_ENV != "production":
    os.environ.setdefault("OAUTHLIB_INSECURE_TRANSPORT", "1")

oauth = OAuth()

oauth.register(
    name="google",
    client_id=GOOGLE_CLIENT_ID,
    client_secret=GOOGLE_CLIENT_SECRET,
    server_metadata_url=(
        "https://accounts.google.com/.well-known/openid-configuration"
    ),
    client_kwargs={
        "scope": (
            "openid email profile "
            "https://www.googleapis.com/auth/gmail.readonly"
        )
    }
)

with engine.connect() as conn:
    try:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        conn.commit()
    except Exception as e:
        print(f"pgvector not available, skipping: {e}")
        conn.rollback()

Base.metadata.create_all(bind=engine)
run_migrations(engine)

if BEACON_ADMIN_EMAIL:
    with SessionLocal() as db:
        admin = db.query(AllowedUser).filter(AllowedUser.email == BEACON_ADMIN_EMAIL).first()
        if not admin:
            db.add(AllowedUser(
                id=str(uuid.uuid4()), email=BEACON_ADMIN_EMAIL,
                invited_by="BEACON_ADMIN_EMAIL", status="active",
            ))
            db.commit()

scheduler = BackgroundScheduler()


# ── Pydantic models ──────────────────────────────────────────────────────────

class AskRequest(BaseModel):
    question: str


class SettingsRequest(BaseModel):
    auto_sync_enabled: bool
    sync_frequency_hours: int
    sync_email_count: int


class AllowedUserRequest(BaseModel):
    email: str


class BulkNotificationRequest(BaseModel):
    ids: list[str]
    status: str


class FeedbackRequest(BaseModel):
    useful: bool
    reason: str | None = None


# ── Helpers ──────────────────────────────────────────────────────────────────

def normalize_email(value: str) -> str:
    return (value or "").strip().casefold()


def require_user(request: Request) -> str:
    user_email = normalize_email(request.session.get("user_email", ""))
    if not user_email:
        raise HTTPException(status_code=401, detail="Not authenticated")
    with SessionLocal() as db:
        allowed = db.query(AllowedUser).filter(
            AllowedUser.email == user_email,
            AllowedUser.status.in_(["invited", "active"]),
        ).first()
    if not allowed:
        request.session.clear()
        raise HTTPException(status_code=403, detail="Beacon access has been revoked")
    return user_email


def require_admin(request: Request) -> str:
    user_email = require_user(request)
    if not BEACON_ADMIN_EMAIL or user_email != BEACON_ADMIN_EMAIL:
        raise HTTPException(status_code=403, detail="Administrator access required")
    return user_email


def _fernet():
    if not TOKEN_ENCRYPTION_KEY:
        if APP_ENV == "production":
            raise RuntimeError("TOKEN_ENCRYPTION_KEY is required in production")
        return None
    from cryptography.fernet import Fernet
    return Fernet(TOKEN_ENCRYPTION_KEY.encode())


def encrypt_token(value: str | None) -> str | None:
    if not value:
        return None
    if value.startswith("fernet:"):
        return value
    cipher = _fernet()
    return "fernet:" + cipher.encrypt(value.encode()).decode() if cipher else value


def decrypt_token(value: str | None) -> str | None:
    if not value or not value.startswith("fernet:"):
        return value
    return _fernet().decrypt(value.removeprefix("fernet:").encode()).decode()


def credentials_for(settings: UserSettings) -> Credentials:
    creds = Credentials(
        token=decrypt_token(settings.google_access_token),
        refresh_token=decrypt_token(settings.google_refresh_token),
        token_uri="https://oauth2.googleapis.com/token",
        client_id=GOOGLE_CLIENT_ID,
        client_secret=GOOGLE_CLIENT_SECRET,
    )
    if not creds.token or (settings.google_token_expires_at and settings.google_token_expires_at <= datetime.utcnow()):
        if not creds.refresh_token:
            raise RuntimeError("Gmail is disconnected; reconnect it in Settings")
        creds.refresh(GoogleRequest())
        settings.google_access_token = encrypt_token(creds.token)
        settings.google_token_expires_at = creds.expiry
    # Lazy, non-disruptive migration of legacy plaintext credentials.
    settings.google_refresh_token = encrypt_token(settings.google_refresh_token)
    settings.google_access_token = encrypt_token(settings.google_access_token)
    return creds


class _HTMLTextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []
    def handle_data(self, data):
        self.parts.append(data)


def html_to_text(value: str) -> str:
    parser = _HTMLTextExtractor()
    parser.feed(value)
    return unescape(" ".join(parser.parts)).strip()


def _oauth_state_hash(state: str) -> str:
    return hashlib.sha256(state.encode("utf-8")).hexdigest()


def persist_oauth_state(request: Request, location: str) -> None:
    state = parse_qs(urlparse(location).query).get("state", [None])[0]
    if not state:
        raise RuntimeError("Google authorization redirect did not include state")
    session_key = f"_state_google_{state}"
    state_data = request.session.get(session_key)
    if not state_data:
        raise RuntimeError("Google authorization state was not saved in the session")
    db = SessionLocal()
    db.query(OAuthState).filter(OAuthState.expires_at <= datetime.utcnow()).delete(
        synchronize_session=False
    )
    db.add(OAuthState(
        id=str(uuid.uuid4()),
        state_hash=_oauth_state_hash(state),
        state_data=json.dumps(state_data),
        expires_at=datetime.utcnow() + timedelta(minutes=10),
    ))
    db.commit()
    db.close()


def restore_oauth_state(request: Request, state: str) -> None:
    session_key = f"_state_google_{state}"
    if request.session.get(session_key):
        return
    db = SessionLocal()
    record = db.query(OAuthState).filter(
        OAuthState.state_hash == _oauth_state_hash(state),
        OAuthState.expires_at > datetime.utcnow(),
    ).first()
    if not record:
        db.close()
        return
    request.session[session_key] = json.loads(record.state_data)
    db.delete(record)
    db.commit()
    db.close()

def update_job_status(job_id: str, status: str):
    db: Session = SessionLocal()
    job = db.query(SyncJob).filter(SyncJob.id == job_id).first()
    if job:
        job.status = status
        db.commit()
    db.close()


def extract_email_body(payload: dict) -> str:
    mime_type = payload.get("mimeType", "")

    if mime_type in {"text/plain", "text/html"}:
        data = payload.get("body", {}).get("data", "")
        if data:
            decoded = base64.urlsafe_b64decode(
                data + "=="
            ).decode("utf-8", errors="ignore")
            return html_to_text(decoded) if mime_type == "text/html" else decoded

    for part in payload.get("parts", []):
        body = extract_email_body(part)
        if body:
            return body

    return ""


UNSUBSCRIBE_URL_PATTERN = re.compile(r"<(https?://[^>]+)>")
UNSUBSCRIBE_MAILTO_PATTERN = re.compile(r"<(mailto:[^>]+)>")


def extract_unsubscribe_url(header_value: str) -> str:
    if not header_value:
        return ""

    https_match = UNSUBSCRIBE_URL_PATTERN.search(header_value)
    if https_match:
        return https_match.group(1)

    mailto_match = UNSUBSCRIBE_MAILTO_PATTERN.search(header_value)
    if mailto_match:
        return mailto_match.group(1)

    return ""


def fetch_recent_emails(token, max_results: int = 100):
    credentials = Credentials(token=token["access_token"])
    gmail = build("gmail", "v1", credentials=credentials)

    messages = []
    page_token = None
    while len(messages) < max_results:
        page_size = min(500, max_results - len(messages))
        results = gmail.users().messages().list(
            userId="me", maxResults=page_size,
            q=f"newer_than:{SYNC_WINDOW_DAYS}d", pageToken=page_token,
        ).execute()
        messages.extend(results.get("messages", []))
        page_token = results.get("nextPageToken")
        if not page_token:
            break
    logger.info("gmail_sync_listed", extra={"count": len(messages)})

    emails = []

    for message in messages:
        msg = gmail.users().messages().get(
            userId="me", id=message["id"], format="full"
        ).execute()

        headers = msg["payload"].get("headers", [])
        subject = ""
        sender = ""
        unsubscribe_url = ""
        rfc822_message_id = ""

        for header in headers:
            if header["name"] == "Subject":
                subject = header["value"]
            if header["name"] == "From":
                sender = header["value"]
            if header["name"].lower() == "list-unsubscribe":
                unsubscribe_url = extract_unsubscribe_url(header["value"])
            if header["name"].lower() == "message-id":
                rfc822_message_id = header["value"].strip().strip("<>")

        snippet = msg.get("snippet", "No preview available")
        body = extract_email_body(msg["payload"]) or snippet

        sender_email = parseaddr(sender)[1] if sender else ""
        thread_id = msg.get("threadId")

        internal_date = msg.get("internalDate")
        received_at = (
            datetime.utcfromtimestamp(int(internal_date) / 1000)
            if internal_date else None
        )

        email_content = (
            f"\nSubject: {subject}\n\nFrom: {sender}\n\nBody:\n{body}\n"
        )

        emails.append({
            "gmail_message_id": message["id"],
            "content": email_content,
            "sender": sender,
            "sender_email": sender_email,
            "subject": subject,
            "snippet": snippet,
            "body": body,
            "thread_id": thread_id,
            "received_at": received_at,
            "unsubscribe_url": unsubscribe_url,
            "rfc822_message_id": rfc822_message_id
        })

    return emails


BULK_SENDER_PATTERN = re.compile(
    r"no-?reply|do-?not-?reply|notifications?@|marketing@|newsletter",
    re.IGNORECASE
)


def build_insight_candidates(db: Session, user_email: str, window_days: int = 30):
    cutoff = datetime.utcnow() - timedelta(days=window_days)

    emails = db.query(ProcessedEmail).filter(
        ProcessedEmail.user_email == user_email,
        ProcessedEmail.received_at.isnot(None),
        ProcessedEmail.received_at >= cutoff
    ).all()

    by_sender = defaultdict(list)
    for e in emails:
        if e.sender_email:
            by_sender[e.sender_email].append(e)

    now = datetime.utcnow()
    candidates = []

    for sender_email, msgs in by_sender.items():
        if sender_email == user_email:
            continue
        if BULK_SENDER_PATTERN.search(sender_email):
            continue

        msgs.sort(key=lambda m: m.received_at)
        latest = msgs[-1]
        days_since = (now - latest.received_at).days
        display_name = latest.sender or sender_email

        replied = False
        if latest.thread_id:
            replied = db.query(ProcessedEmail).filter(
                ProcessedEmail.user_email == user_email,
                ProcessedEmail.sender_email == user_email,
                ProcessedEmail.thread_id == latest.thread_id,
                ProcessedEmail.received_at > latest.received_at
            ).first() is not None

        if not replied and days_since >= 3:
            candidates.append({
                "subject_key": f"relationship:{sender_email}",
                "insight_type": "relationship",
                "sender": display_name,
                "days_since_contact": days_since,
                "message_count": len(msgs),
                "signal": "no_reply",
                "email_ids": [message.id for message in msgs[-5:]],
            })

        if len(msgs) >= 3:
            candidates.append({
                "subject_key": f"volume:{sender_email}",
                "insight_type": "high_volume",
                "sender": display_name,
                "days_since_contact": days_since,
                "message_count": len(msgs),
                "signal": "high_volume",
                "email_ids": [message.id for message in msgs[-5:]],
            })

    return candidates


def save_insights(db: Session, user_email: str, insight_dicts: list):
    for ins in insight_dicts:
        subject_key = ins.get("subject_key")
        insight_type = ins.get("insight_type", "relationship")
        title = ins.get("title")

        confidence = max(0, min(100, int(ins.get("confidence", 70))))
        score = (
            float(ins.get("actionability", 0.5))
            * float(ins.get("urgency", 0.5))
            * (confidence / 100)
            * float(ins.get("novelty", 0.7))
        )
        threshold = float(os.getenv("INSIGHT_SCORE_THRESHOLD", "0.08"))
        if not subject_key or not title or score < threshold:
            continue

        existing = db.query(Insight).filter(
            Insight.user_email == user_email,
            Insight.insight_type == insight_type,
            Insight.subject_key == subject_key,
            Insight.is_dismissed == False
        ).first()

        if existing:
            existing.title = title
            existing.description = ins.get("description", "")
            existing.created_at = datetime.utcnow()
            existing.updated_at = datetime.utcnow()
            existing.confidence = confidence
            existing.score = score
            existing.evidence_email_ids = json.dumps(ins.get("evidence_email_ids", []))
        else:
            db.add(Insight(
                id=str(uuid.uuid4()),
                user_email=user_email,
                insight_type=insight_type,
                title=title,
                description=ins.get("description", ""),
                subject_key=subject_key,
                is_dismissed=False,
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
                status="active",
                confidence=confidence,
                score=score,
                evidence_email_ids=json.dumps(ins.get("evidence_email_ids", [])),
            ))


def process_sync(
    job_id: str,
    token,
    user_email: str,
    email_count: int = 100
):
    update_job_status(job_id, "fetching_emails")
    try:
        emails = fetch_recent_emails(token, max_results=email_count)
    except Exception as exc:
        db = SessionLocal()
        db.query(SyncJob).filter(SyncJob.id == job_id).update({
            "status": "failed", "error": str(exc), "completed_at": datetime.utcnow()
        })
        db.commit()
        db.close()
        logger.exception("Gmail fetch failed for sync job %s", job_id)
        return

    update_job_status(job_id, "filtering_threads")
    update_job_status(job_id, "extracting_tasks")

    db: Session = SessionLocal()
    today = datetime.utcnow().strftime("%Y-%m-%d")
    stats = {"emails_synced": len(emails), "emails_parsed": 0,
             "emails_embedded": 0, "embedding_failures": 0, "indexed_chunks": 0}

    for email_data in emails:
        existing_email = db.query(ProcessedEmail).filter(
            ProcessedEmail.gmail_message_id == email_data["gmail_message_id"],
            ProcessedEmail.user_email == user_email
        ).first()

        if existing_email:
            # Gmail message resources are immutable; already-indexed messages
            # do not need repeated LLM or embedding calls.
            continue

        notifications = analyze_email(email_data["content"], today)

        email_id = str(uuid.uuid4())

        processed_email = ProcessedEmail(
            id=email_id,
            gmail_message_id=email_data["gmail_message_id"],
            user_email=user_email,
            sender=email_data["sender"],
            sender_email=email_data["sender_email"],
            subject=email_data["subject"],
            snippet=email_data["snippet"],
            body=email_data["body"],
            thread_id=email_data["thread_id"],
            received_at=email_data["received_at"],
            unsubscribe_url=email_data["unsubscribe_url"] or None,
            rfc822_message_id=email_data["rfc822_message_id"] or None
        )
        db.add(processed_email)
        db.flush()
        stats["emails_parsed"] += 1

        for note in notifications:
            title = note.get("title")
            if not title:
                continue

            existing_notification = db.query(Notification).filter(
                Notification.title == title,
                Notification.user_email == user_email
            ).first()

            if existing_notification:
                print("SKIPPING DUPLICATE NOTIFICATION")
                continue

            deadline = None
            if note.get("deadline"):
                try:
                    deadline = datetime.fromisoformat(note["deadline"])
                except Exception:
                    deadline = None

            notification = Notification(
                id=str(uuid.uuid4()),
                user_email=user_email,
                title=title,
                summary=note.get("summary", ""),
                reason=note.get("reason", ""),
                kind=note.get("kind", "other"),
                urgency=note.get("urgency", "upcoming"),
                confidence=note.get("confidence"),
                deadline=deadline,
                recommended_actions=json.dumps(
                    note.get("recommended_actions", [])
                ),
                source_email_id=email_id,
                sender=email_data["sender"],
                subject=email_data["subject"],
                status="open"
            )
            db.add(notification)

        chunks = chunk_text(email_data["body"] or email_data["snippet"])
        embedded = False

        for i, chunk in enumerate(chunks):
            chunk_content = (
                f"Subject: {email_data['subject']}\n"
                f"From: {email_data['sender']}\n\n"
                f"{chunk}"
            )
            try:
                embedding = embed_text(chunk_content)
            except Exception:
                stats["embedding_failures"] += 1
                logger.exception("Embedding failed for Gmail message %s", email_data["gmail_message_id"])
                continue

            email_chunk = EmailChunk(
                id=str(uuid.uuid4()),
                processed_email_id=email_id,
                user_email=user_email,
                chunk_index=i,
                content=chunk_content,
                embedding=embedding
            )
            db.add(email_chunk)
            stats["indexed_chunks"] += 1
            embedded = True

        processed_email.content_hash = hashlib.sha256(
            (email_data["body"] or email_data["snippet"]).encode("utf-8")
        ).hexdigest()
        if embedded:
            processed_email.embedded_at = datetime.utcnow()
            stats["emails_embedded"] += 1

    db.commit()

    update_job_status(job_id, "generating_summary")

    try:
        candidates = build_insight_candidates(db, user_email)
        insight_dicts = generate_insights(candidates)
        save_insights(db, user_email, insight_dicts)
        db.commit()
    except Exception as e:
        print(f"INSIGHT GENERATION FAILED: {e}")
        db.rollback()

    job = db.query(SyncJob).filter(SyncJob.id == job_id).first()
    for key, value in stats.items():
        setattr(job, key, value)
    job.status = "complete"
    job.completed_at = datetime.utcnow()
    indexing = db.query(IndexingStatus).filter(IndexingStatus.user_email == user_email).first()
    if not indexing:
        indexing = IndexingStatus(user_email=user_email)
        db.add(indexing)
    for key, value in stats.items():
        setattr(indexing, key, value)
    indexing.last_successful_indexing_at = datetime.utcnow()
    db.commit()
    db.close()


def run_auto_sync():
    db: Session = SessionLocal()
    try:
        now = datetime.utcnow()

        enabled_users = db.query(UserSettings).join(
            AllowedUser, AllowedUser.email == UserSettings.user_email
        ).filter(
            UserSettings.auto_sync_enabled == True,
            UserSettings.google_refresh_token.isnot(None),
            UserSettings.gmail_connected == True,
            AllowedUser.status.in_(["invited", "active"]),
        ).all()

        for user_settings in enabled_users:
            if user_settings.last_auto_synced_at:
                next_sync = user_settings.last_auto_synced_at + timedelta(
                    hours=user_settings.sync_frequency_hours
                )
                if now < next_sync:
                    continue

            try:
                creds = credentials_for(user_settings)

                token = {"access_token": creds.token}

                job_id = str(uuid.uuid4())
                job = SyncJob(id=job_id, status="queued", user_email=user_settings.user_email)
                db.add(job)

                user_settings.last_auto_synced_at = now
                db.commit()

                thread = threading.Thread(
                    target=process_sync,
                    args=(
                        job_id,
                        token,
                        user_settings.user_email,
                        user_settings.sync_email_count
                    )
                )
                thread.start()

                print(f"Auto-sync started for {user_settings.user_email}")

            except Exception as e:
                print(
                    f"Auto-sync failed for {user_settings.user_email}: {e}"
                )

    finally:
        db.close()


# ── App setup ─────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler.add_job(run_auto_sync, "interval", minutes=30)
    scheduler.start()
    yield
    scheduler.shutdown()


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    SessionMiddleware,
    secret_key=SESSION_SECRET,
    same_site="none" if APP_ENV == "production" else "lax",
    https_only=APP_ENV == "production",
    max_age=30 * 24 * 60 * 60
)

_allowed_origins = [origin for origin in {
    FRONTEND_URL,
    "http://localhost:5173" if APP_ENV != "production" else None,
    "http://127.0.0.1:5173" if APP_ENV != "production" else None,
    "https://beacon-ai-assistant.com",
    "https://www.beacon-ai-assistant.com",
} if origin]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"message": "Backend running"}


@app.get("/auth/login")
async def login(request: Request):
    redirect_uri = f"{BACKEND_URL}/auth/callback"
    response = await oauth.google.authorize_redirect(
        request,
        redirect_uri,
        access_type="offline",
        prompt="consent select_account",
        include_granted_scopes="true",
    )
    persist_oauth_state(request, response.headers["location"])
    return response


@app.get("/auth/callback")
async def auth_callback(request: Request):
    try:
        callback_state = request.query_params.get("state")
        if callback_state:
            restore_oauth_state(request, callback_state)
        token = await oauth.google.authorize_access_token(request)
        userinfo = token.get("userinfo")
        if not userinfo or not userinfo.get("email_verified"):
            raise HTTPException(status_code=403, detail="Google email is not verified")
        user_email = normalize_email(userinfo["email"])

        db: Session = SessionLocal()
        allowed = db.query(AllowedUser).filter(AllowedUser.email == user_email).first()
        if not allowed or allowed.status not in {"invited", "active"}:
            logger.warning("invite_only_login_rejected email=%s", user_email)
            db.close()
            request.session.clear()
            return HTMLResponse(
                "<html><body style='font-family:system-ui;max-width:560px;margin:80px auto'>"
                "<h1>Beacon is currently invite-only</h1>"
                "<p>This Google account has not been invited yet. Please contact the Beacon administrator.</p>"
                "</body></html>", status_code=403,
            )

        settings = db.query(UserSettings).filter(UserSettings.user_email == user_email).first()
        if not settings:
            settings = UserSettings(user_email=user_email)
            db.add(settings)
        if token.get("refresh_token"):
            settings.google_refresh_token = encrypt_token(token["refresh_token"])
        settings.google_access_token = encrypt_token(token.get("access_token"))
        expires_at = token.get("expires_at")
        settings.google_token_expires_at = datetime.utcfromtimestamp(expires_at) if expires_at else None
        settings.gmail_connected = True
        allowed.status = "active"
        allowed.last_login_at = datetime.utcnow()
        db.commit()
        db.close()

        request.session.clear()
        request.session["user_email"] = user_email
        request.session["user_name"] = userinfo.get("name", "")

        return RedirectResponse(FRONTEND_URL)

    except HTTPException:
        raise
    except Exception:
        logger.exception("OAuth callback failed")
        return HTMLResponse(
            "<html><body style='font-family:system-ui;max-width:560px;margin:80px auto'>"
            "<h1>We couldn't connect Gmail</h1>"
            "<p>The authorization could not be completed. Start a fresh, secure sign-in attempt.</p>"
            "<p><a href='/auth/login' style='display:inline-block;padding:12px 18px;"
            "background:#6366f1;color:white;border-radius:10px;text-decoration:none'>"
            "Try again</a></p></body></html>",
            status_code=400,
        )


@app.get("/auth/status")
async def auth_status(request: Request):
    return {"authenticated": bool(request.session.get("user_email"))}


@app.post("/auth/logout")
async def logout(request: Request):
    request.session.clear()
    return {"success": True}


@app.post("/auth/disconnect")
def disconnect_gmail(request: Request):
    user_email = require_user(request)
    db = SessionLocal()
    settings = db.query(UserSettings).filter(UserSettings.user_email == user_email).first()
    if settings:
        token = decrypt_token(settings.google_refresh_token) or decrypt_token(settings.google_access_token)
        if token:
            try:
                http_requests.post(
                    "https://oauth2.googleapis.com/revoke",
                    params={"token": token}, timeout=10,
                    headers={"content-type": "application/x-www-form-urlencoded"},
                )
            except http_requests.RequestException:
                logger.exception("Google revocation request failed; local credentials still removed")
        settings.google_refresh_token = None
        settings.google_access_token = None
        settings.google_token_expires_at = None
        settings.gmail_connected = False
        settings.auto_sync_enabled = False
        db.commit()
    db.close()
    request.session.clear()
    return {"success": True, "message": "Gmail disconnected and stored credentials removed."}


@app.get("/me")
def get_me(request: Request):
    user_email = request.session.get("user_email")
    if not user_email:
        return {"authenticated": False}
    return {
        "authenticated": True,
        "email": user_email,
        "name": request.session.get("user_name", "")
    }


@app.get("/tasks")
def get_tasks(request: Request, completed: bool = False):
    db: Session = SessionLocal()
    user_email = require_user(request)

    tasks = db.query(Task).filter(
        Task.user_email == user_email,
        Task.is_completed == completed,
        Task.is_hidden == False
    ).all()

    result = []
    for task in tasks:
        result.append({
            "id": task.id,
            "title": task.title,
            "status": task.status,
            "category": task.category,
            "priority": task.priority,
            "is_completed": task.is_completed,
            "is_hidden": task.is_hidden,
            "completed_at": (
                task.completed_at.isoformat()
                if task.completed_at else None
            ),
        })

    db.close()
    return {"tasks": result}


@app.post("/sync")
async def start_sync(request: Request):
    user_email = require_user(request)
    db: Session = SessionLocal()

    settings = db.query(UserSettings).filter(
        UserSettings.user_email == user_email
    ).first()
    if not settings or not settings.gmail_connected:
        db.close()
        raise HTTPException(status_code=409, detail="Gmail is disconnected")
    creds = credentials_for(settings)
    token = {"access_token": creds.token}
    email_count = settings.sync_email_count

    job_id = str(uuid.uuid4())
    job = SyncJob(id=job_id, status="queued", user_email=user_email)
    db.add(job)
    db.commit()
    db.close()

    thread = threading.Thread(
        target=process_sync,
        args=(job_id, token, user_email, email_count)
    )
    thread.start()

    return {"job_id": job_id}


@app.get("/sync-status/{job_id}")
def get_sync_status(job_id: str, request: Request):
    user_email = require_user(request)
    db: Session = SessionLocal()
    job = db.query(SyncJob).filter(
        SyncJob.id == job_id, SyncJob.user_email == user_email
    ).first()

    if not job:
        db.close()
        return {"status": "not_found"}

    result = {
        "status": job.status, "emails_synced": job.emails_synced,
        "emails_parsed": job.emails_parsed, "emails_embedded": job.emails_embedded,
        "embedding_failures": job.embedding_failures, "indexed_chunks": job.indexed_chunks,
        "error": job.error,
    }
    db.close()
    return result


@app.post("/tasks/{task_id}/complete")
def complete_task(task_id: str, request: Request):
    user_email = require_user(request)
    db: Session = SessionLocal()
    task = db.query(Task).filter(Task.id == task_id, Task.user_email == user_email).first()

    if not task:
        db.close()
        return {"error": "Task not found"}

    task.is_completed = True
    task.completed_at = datetime.utcnow()
    db.commit()
    db.close()
    return {"success": True}


@app.post("/tasks/{task_id}/reopen")
def reopen_task(task_id: str, request: Request):
    user_email = require_user(request)
    db: Session = SessionLocal()
    task = db.query(Task).filter(Task.id == task_id, Task.user_email == user_email).first()

    if not task:
        db.close()
        return {"error": "Task not found"}

    task.is_completed = False
    task.completed_at = None
    db.commit()
    db.close()
    return {"success": True}


@app.post("/tasks/{task_id}/hide")
def hide_task(task_id: str, request: Request):
    user_email = require_user(request)
    db: Session = SessionLocal()
    task = db.query(Task).filter(Task.id == task_id, Task.user_email == user_email).first()

    if not task:
        db.close()
        return {"error": "Task not found"}

    task.is_hidden = True
    db.commit()
    db.close()
    return {"success": True}


def _serialize_notification(
    n: Notification,
    gmail_message_id: str = None,
    unsubscribe_url: str = None,
    rfc822_message_id: str = None,
) -> dict:
    try:
        actions = json.loads(n.recommended_actions) if n.recommended_actions else []
    except Exception:
        actions = []

    return {
        "id": n.id,
        "title": n.title,
        "summary": n.summary,
        "reason": n.reason,
        "kind": n.kind,
        "urgency": n.urgency,
        "confidence": n.confidence,
        "deadline": n.deadline.isoformat() if n.deadline else None,
        "recommended_actions": actions,
        "sender": n.sender,
        "subject": n.subject,
        "source_email_id": n.source_email_id,
        "gmail_message_id": gmail_message_id,
        "unsubscribe_url": unsubscribe_url,
        "rfc822_message_id": rfc822_message_id,
        "status": n.status,
        "snoozed_until": n.snoozed_until.isoformat() if n.snoozed_until else None,
        "completed_at": n.completed_at.isoformat() if n.completed_at else None,
        "created_at": n.created_at.isoformat() if n.created_at else None,
    }


@app.get("/notifications")
def get_notifications(request: Request, status: str = "open"):
    user_email = request.session.get("user_email")
    if not user_email:
        return {"error": "Not authenticated"}

    db: Session = SessionLocal()
    now = datetime.utcnow()

    if status == "open":
        rows = db.query(Notification).filter(
            Notification.user_email == user_email,
            Notification.status.in_(["open", "snoozed"])
        ).all()
        rows = [
            n for n in rows
            if n.status == "open" or (n.snoozed_until and n.snoozed_until <= now)
        ]
        # Auto-expire: a passed deadline drops the card from the active view.
        rows = [
            n for n in rows
            if not n.deadline or n.deadline >= now
        ]
        urgency_rank = {"high_priority": 0, "upcoming": 1}
        rows.sort(key=lambda n: (
            urgency_rank.get(n.urgency, 2),
            -(n.created_at.timestamp() if n.created_at else 0)
        ))
    else:
        rows = db.query(Notification).filter(
            Notification.user_email == user_email,
            Notification.status == status
        ).all()
        rows.sort(
            key=lambda n: -(
                (n.completed_at or n.created_at or datetime.min).timestamp()
            )
        )

    email_ids = [n.source_email_id for n in rows if n.source_email_id]
    emails_by_id = {}
    if email_ids:
        source_emails = db.query(ProcessedEmail).filter(
            ProcessedEmail.id.in_(email_ids)
        ).all()
        emails_by_id = {e.id: e for e in source_emails}

    result = []
    for n in rows:
        email = emails_by_id.get(n.source_email_id)
        result.append(_serialize_notification(
            n,
            email.gmail_message_id if email else None,
            email.unsubscribe_url if email else None,
            email.rfc822_message_id if email else None,
        ))

    db.close()
    return {"notifications": result}


@app.post("/notifications/{notification_id}/complete")
def complete_notification(notification_id: str, request: Request):
    user_email = require_user(request)
    db: Session = SessionLocal()
    n = db.query(Notification).filter(Notification.id == notification_id, Notification.user_email == user_email).first()

    if not n:
        db.close()
        return {"error": "Notification not found"}

    n.status = "completed"
    n.completed_at = datetime.utcnow()
    db.commit()
    db.close()
    return {"success": True}


@app.post("/notifications/{notification_id}/dismiss")
def dismiss_notification(notification_id: str, request: Request):
    user_email = require_user(request)
    db: Session = SessionLocal()
    n = db.query(Notification).filter(Notification.id == notification_id, Notification.user_email == user_email).first()

    if not n:
        db.close()
        return {"error": "Notification not found"}

    n.status = "dismissed"
    db.commit()
    db.close()
    return {"success": True}


@app.post("/notifications/{notification_id}/reopen")
def reopen_notification(notification_id: str, request: Request):
    user_email = require_user(request)
    db: Session = SessionLocal()
    n = db.query(Notification).filter(Notification.id == notification_id, Notification.user_email == user_email).first()

    if not n:
        db.close()
        return {"error": "Notification not found"}

    n.status = "open"
    n.completed_at = None
    n.snoozed_until = None
    db.commit()
    db.close()
    return {"success": True}


@app.post("/notifications/{notification_id}/snooze")
def snooze_notification(notification_id: str, request: Request):
    user_email = require_user(request)
    db: Session = SessionLocal()
    n = db.query(Notification).filter(Notification.id == notification_id, Notification.user_email == user_email).first()

    if not n:
        db.close()
        return {"error": "Notification not found"}

    n.status = "snoozed"
    n.snoozed_until = datetime.utcnow() + timedelta(days=1)
    db.commit()
    db.close()
    return {"success": True}


@app.post("/notifications/{notification_id}/draft-reply")
def draft_reply(notification_id: str, request: Request):
    user_email = require_user(request)
    db: Session = SessionLocal()
    n = db.query(Notification).filter(Notification.id == notification_id, Notification.user_email == user_email).first()

    if not n:
        db.close()
        return {"error": "Notification not found"}

    if n.ai_draft_reply:
        draft = n.ai_draft_reply
        db.close()
        return {"draft": draft}

    email = db.query(ProcessedEmail).filter(
        ProcessedEmail.id == n.source_email_id
    ).first()

    if not email:
        db.close()
        return {"error": "Source email not found"}

    content = (
        f"Subject: {email.subject}\n\nFrom: {email.sender}\n\nBody:\n{email.body}"
    )
    draft = generate_reply_draft(content, n.title)

    n.ai_draft_reply = draft
    db.commit()
    db.close()
    return {"draft": draft}


@app.patch("/notifications/bulk")
def bulk_update_notifications(body: BulkNotificationRequest, request: Request):
    user_email = require_user(request)
    if body.status not in {"completed", "dismissed"}:
        raise HTTPException(status_code=422, detail="Unsupported status")
    ids = list(dict.fromkeys(body.ids))[:500]
    if not ids:
        return {"updated": 0}
    db = SessionLocal()
    values = {"status": body.status}
    if body.status == "completed":
        values["completed_at"] = datetime.utcnow()
    updated = db.query(Notification).filter(
        Notification.user_email == user_email,
        Notification.id.in_(ids),
        Notification.status.in_(["open", "snoozed"]),
    ).update(values, synchronize_session=False)
    db.commit()
    db.close()
    return {"updated": updated}


@app.get("/emails/{email_id}")
def get_email(email_id: str, request: Request):
    user_email = request.session.get("user_email")
    if not user_email:
        return {"error": "Not authenticated"}

    db: Session = SessionLocal()
    email = db.query(ProcessedEmail).filter(
        ProcessedEmail.id == email_id,
        ProcessedEmail.user_email == user_email
    ).first()
    db.close()

    if not email:
        return {"error": "Email not found"}

    return {
        "id": email.id,
        "gmail_message_id": email.gmail_message_id,
        "sender": email.sender,
        "subject": email.subject,
        "snippet": email.snippet,
        "body": email.body,
        "received_at": email.received_at.isoformat() if email.received_at else None,
        "unsubscribe_url": email.unsubscribe_url,
        "rfc822_message_id": email.rfc822_message_id,
    }


@app.get("/emails/{email_id}/open")
def open_email_in_gmail(email_id: str, request: Request):
    user_email = require_user(request)
    db = SessionLocal()
    email = db.query(ProcessedEmail).filter(
        ProcessedEmail.id == email_id,
        ProcessedEmail.user_email == user_email,
    ).first()
    if not email:
        db.close()
        raise HTTPException(status_code=404, detail="Email not found")
    target = gmail_web_url(
        user_email,
        email.thread_id,
        email.gmail_message_id,
        email.rfc822_message_id,
    )
    db.close()
    if not target:
        raise HTTPException(status_code=404, detail="Gmail link is unavailable")
    return RedirectResponse(target, status_code=302)


@app.get("/insights")
def get_insights(request: Request):
    user_email = request.session.get("user_email")
    if not user_email:
        return {"error": "Not authenticated"}

    db: Session = SessionLocal()
    db.query(Insight).filter(
        Insight.user_email == user_email,
        Insight.status == "active",
        Insight.expires_at.isnot(None),
        Insight.expires_at <= datetime.utcnow(),
    ).update({"status": "expired", "updated_at": datetime.utcnow()}, synchronize_session=False)
    db.commit()
    insights = db.query(Insight).filter(
        Insight.user_email == user_email,
        Insight.is_dismissed == False,
        Insight.status == "active",
        ((Insight.expires_at.is_(None)) | (Insight.expires_at > datetime.utcnow())),
    ).order_by(Insight.created_at.desc()).limit(10).all()
    db.close()

    return {"insights": [
        {
            "id": i.id,
            "title": i.title,
            "description": i.description,
            "insight_type": i.insight_type,
            "created_at": i.created_at.isoformat() if i.created_at else None,
            "evidence_email_ids": json.loads(i.evidence_email_ids or "[]"),
        }
        for i in insights
    ]}


@app.post("/insights/{insight_id}/dismiss")
def dismiss_insight(insight_id: str, request: Request):
    user_email = require_user(request)
    db: Session = SessionLocal()
    insight = db.query(Insight).filter(Insight.id == insight_id, Insight.user_email == user_email).first()

    if not insight:
        db.close()
        return {"error": "Insight not found"}

    insight.is_dismissed = True
    insight.status = "dismissed"
    insight.updated_at = datetime.utcnow()
    db.commit()
    db.close()
    return {"success": True}


@app.post("/insights/{insight_id}/feedback")
def add_insight_feedback(insight_id: str, body: FeedbackRequest, request: Request):
    user_email = require_user(request)
    allowed_reasons = {None, "already_knew", "incorrect", "not_actionable", "irrelevant", "duplicate"}
    if body.reason not in allowed_reasons:
        raise HTTPException(status_code=422, detail="Unsupported feedback reason")
    db = SessionLocal()
    insight = db.query(Insight).filter(Insight.id == insight_id, Insight.user_email == user_email).first()
    if not insight:
        db.close()
        raise HTTPException(status_code=404, detail="Insight not found")
    db.add(InsightFeedback(
        id=str(uuid.uuid4()), insight_id=insight_id, user_email=user_email,
        useful=body.useful, reason=body.reason,
    ))
    db.commit()
    db.close()
    return {"success": True}


@app.get("/settings")
def get_settings(request: Request):
    user_email = request.session.get("user_email")
    if not user_email:
        return {"error": "Not authenticated"}

    db: Session = SessionLocal()
    settings = db.query(UserSettings).filter(
        UserSettings.user_email == user_email
    ).first()
    db.close()

    if not settings:
        return {
            "auto_sync_enabled": True,
            "sync_frequency_hours": 1,
            "sync_email_count": 100,
            "gmail_connected": False,
        }

    return {
        "auto_sync_enabled": settings.auto_sync_enabled,
        "sync_frequency_hours": settings.sync_frequency_hours,
        "sync_email_count": settings.sync_email_count,
        "gmail_connected": settings.gmail_connected,
    }


@app.post("/settings")
def update_settings(body: SettingsRequest, request: Request):
    user_email = request.session.get("user_email")
    if not user_email:
        return {"error": "Not authenticated"}

    db: Session = SessionLocal()
    settings = db.query(UserSettings).filter(
        UserSettings.user_email == user_email
    ).first()

    if not settings:
        settings = UserSettings(user_email=user_email)
        db.add(settings)

    settings.auto_sync_enabled = body.auto_sync_enabled
    settings.sync_frequency_hours = body.sync_frequency_hours
    settings.sync_email_count = body.sync_email_count
    db.commit()
    db.close()

    return {"success": True}


def hybrid_retrieve(db: Session, user_email: str, query: str, limit: int):
    query_embedding = embed_text(query)
    semantic = db.query(EmailChunk).filter(
        EmailChunk.user_email == user_email
    ).order_by(EmailChunk.embedding.cosine_distance(query_embedding)).limit(limit * 4).all()

    terms = search_terms(query)
    keyword = []
    if terms:
        keyword_query = db.query(EmailChunk).join(
            ProcessedEmail, ProcessedEmail.id == EmailChunk.processed_email_id
        ).filter(EmailChunk.user_email == user_email)
        keyword_query = keyword_query.filter(
            or_(*[
                func.lower(
                    func.concat(
                        func.coalesce(ProcessedEmail.subject, ""), " ",
                        func.coalesce(ProcessedEmail.sender, ""), " ",
                        func.coalesce(EmailChunk.content, ""),
                    )
                ).contains(term)
                for term in terms
            ])
        )
        keyword = keyword_query.limit(limit * 4).all()

    chunks_by_email = {}
    for chunks in (semantic, keyword):
        for chunk in chunks:
            chunks_by_email.setdefault(chunk.processed_email_id, chunk)
    ranked_ids = reciprocal_rank_fusion(
        [[chunk.processed_email_id for chunk in semantic],
         [chunk.processed_email_id for chunk in keyword]],
        [1.0, 1.25],
    )[:limit]
    if not ranked_ids:
        return []
    emails = db.query(ProcessedEmail).filter(
        ProcessedEmail.user_email == user_email, ProcessedEmail.id.in_(ranked_ids)
    ).all()
    emails_by_id = {email.id: email for email in emails}
    return [(chunks_by_email[email_id], emails_by_id.get(email_id)) for email_id in ranked_ids]


@app.get("/search")
def semantic_search(query: str, request: Request, limit: int = 10):
    user_email = request.session.get("user_email")
    if not user_email:
        return {"error": "Not authenticated"}

    db: Session = SessionLocal()

    try:
        results = []
        for chunk, email in hybrid_retrieve(db, user_email, query, min(max(limit, 1), 50)):
            results.append({
                "email_id": chunk.processed_email_id,
                "subject": email.subject if email else "",
                "sender": email.sender if email else "",
                "snippet": email.snippet if email else "",
                "chunk_preview": chunk.content[:300],
                "gmail_message_id": email.gmail_message_id if email else None,
                "rfc822_message_id": email.rfc822_message_id if email else None,
            })

        return {"results": results}

    finally:
        db.close()


@app.post("/ask")
def ask_inbox(body: AskRequest, request: Request):
    user_email = request.session.get("user_email")
    if not user_email:
        return {"error": "Not authenticated"}

    db: Session = SessionLocal()

    try:
        retrieved = hybrid_retrieve(db, user_email, body.question, 8)
        context_chunks = [chunk.content for chunk, _ in retrieved]

        sources = []
        seen = set()

        for chunk, email in retrieved:
            if chunk.processed_email_id in seen:
                continue
            seen.add(chunk.processed_email_id)

            if email:
                sources.append({
                    "subject": email.subject,
                    "sender": email.sender
                })

        answer = generate_answer(body.question, context_chunks)
        return {"answer": answer, "sources": sources}

    finally:
        db.close()


@app.get("/indexing-status")
def get_indexing_status(request: Request):
    user_email = require_user(request)
    db = SessionLocal()
    status = db.query(IndexingStatus).filter(IndexingStatus.user_email == user_email).first()
    result = {
        "emails_synced": status.emails_synced if status else 0,
        "emails_parsed": status.emails_parsed if status else 0,
        "emails_embedded": status.emails_embedded if status else 0,
        "embedding_failures": status.embedding_failures if status else 0,
        "indexed_chunks": status.indexed_chunks if status else 0,
        "last_successful_indexing_at": status.last_successful_indexing_at.isoformat() if status and status.last_successful_indexing_at else None,
    }
    db.close()
    return result


@app.get("/admin/allowed-users")
def list_allowed_users(request: Request):
    require_admin(request)
    db = SessionLocal()
    users = db.query(AllowedUser).order_by(AllowedUser.created_at.desc()).all()
    result = [{
        "id": user.id, "email": user.email, "status": user.status,
        "invited_by": user.invited_by,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "last_login_at": user.last_login_at.isoformat() if user.last_login_at else None,
    } for user in users]
    db.close()
    return {"users": result}


@app.post("/admin/allowed-users", status_code=201)
def invite_allowed_user(body: AllowedUserRequest, request: Request):
    admin = require_admin(request)
    email = normalize_email(body.email)
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        raise HTTPException(status_code=422, detail="A valid email is required")
    db = SessionLocal()
    user = db.query(AllowedUser).filter(AllowedUser.email == email).first()
    if user:
        user.status = "invited"
    else:
        user = AllowedUser(id=str(uuid.uuid4()), email=email, invited_by=admin, status="invited")
        db.add(user)
    db.commit()
    db.close()
    return {"success": True, "email": email, "status": "invited"}


@app.patch("/admin/allowed-users/{allowed_user_id}/{status}")
def update_allowed_user(allowed_user_id: str, status: str, request: Request):
    admin = require_admin(request)
    if status not in {"active", "revoked"}:
        raise HTTPException(status_code=422, detail="Status must be active or revoked")
    db = SessionLocal()
    user = db.query(AllowedUser).filter(AllowedUser.id == allowed_user_id).first()
    if not user:
        db.close()
        raise HTTPException(status_code=404, detail="Allowed user not found")
    if user.email == admin and status == "revoked":
        db.close()
        raise HTTPException(status_code=409, detail="The configured administrator cannot be revoked")
    user.status = status
    db.commit()
    db.close()
    return {"success": True, "status": status}


@app.get("/gmail/messages")
async def get_gmail_messages(request: Request):
    user_email = require_user(request)
    db = SessionLocal()
    settings = db.query(UserSettings).filter(UserSettings.user_email == user_email).first()
    if not settings or not settings.gmail_connected:
        db.close()
        raise HTTPException(status_code=409, detail="Gmail is disconnected")
    credentials = credentials_for(settings)
    db.commit()
    db.close()
    gmail = build("gmail", "v1", credentials=credentials)

    results = gmail.users().messages().list(
        userId="me", maxResults=50
    ).execute()

    messages = results.get("messages", [])
    detailed_messages = []

    for message in messages:
        msg = gmail.users().messages().get(
            userId="me", id=message["id"]
        ).execute()

        headers = msg["payload"].get("headers", [])
        subject = ""
        sender = ""

        for header in headers:
            if header["name"] == "Subject":
                subject = header["value"]
            if header["name"] == "From":
                sender = header["value"]

        detailed_messages.append({
            "id": message["id"],
            "subject": subject,
            "from": sender,
            "snippet": msg.get("snippet", "")
        })

    return {"messages": detailed_messages}
