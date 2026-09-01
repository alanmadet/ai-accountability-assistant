from urllib.parse import quote


def gmail_web_url(
    user_email: str,
    thread_id: str | None,
    gmail_message_id: str | None,
    rfc822_message_id: str | None,
) -> str | None:
    """Build a Gmail web URL for a specific user-owned message/thread.

    Beacon redirects to this URL from its own API so mobile browsers retain
    web navigation instead of handing a fragment-only target to the Gmail app.
    """
    # Do not use ?authuser=<email> here. Gmail performs an account-selection
    # redirect before the fragment reaches its client router, which drops the
    # thread target and lands on #inbox. /u/0/ preserves and canonicalizes the
    # Gmail API thread ID on desktop and mobile web.
    base = "https://mail.google.com/mail/u/0/"
    if thread_id:
        return f"{base}#all/{quote(thread_id, safe='')}"
    if gmail_message_id:
        return f"{base}#all/{quote(gmail_message_id, safe='')}"
    if rfc822_message_id:
        query = quote(f"rfc822msgid:{rfc822_message_id}", safe="")
        return f"{base}#search/{query}"
    return None
