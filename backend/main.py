from contextlib import asynccontextmanager
from datetime import datetime, timedelta

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse

from starlette.middleware.sessions import SessionMiddleware

from pydantic import BaseModel

from apscheduler.schedulers.background import BackgroundScheduler

import threading
import uuid
import os
import base64
import json
import re

from collections import defaultdict
from email.utils import parseaddr

os.environ["OAUTHLIB_INSECURE_TRANSPORT"] = "1"

from sqlalchemy.orm import Session
from sqlalchemy import text

from database import SessionLocal, engine, Base

from models import (
    Task, SyncJob, ProcessedEmail, EmailChunk, UserSettings,
    Notification, Insight,
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

load_dotenv(".env.aws", override=True)
load_dotenv()

FRONTEND_URL = os.getenv("FRONTEND_URL")
BACKEND_URL = os.getenv("BACKEND_URL")
SESSION_SECRET = os.getenv("SESSION_SECRET")
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")

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

try:
    Base.metadata.create_all(bind=engine)
except Exception as e:
    print(f"create_all failed (pgvector likely missing): {e}")
    for table in Base.metadata.sorted_tables:
        if table.name == "email_chunks":
            continue
        try:
            table.create(bind=engine, checkfirst=True)
        except Exception as te:
            print(f"Failed to create table {table.name}: {te}")

with engine.connect() as conn:
    for stmt in [
        "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP",
        "ALTER TABLE processed_emails ADD COLUMN IF NOT EXISTS sender_email VARCHAR",
        "ALTER TABLE processed_emails ADD COLUMN IF NOT EXISTS thread_id VARCHAR",
        "ALTER TABLE processed_emails ADD COLUMN IF NOT EXISTS received_at TIMESTAMP",
        "ALTER TABLE processed_emails ADD COLUMN IF NOT EXISTS unsubscribe_url VARCHAR",
        "ALTER TABLE processed_emails ADD COLUMN IF NOT EXISTS rfc822_message_id VARCHAR",
        "ALTER TABLE insights ADD COLUMN IF NOT EXISTS subject_key VARCHAR",
        "ALTER TABLE insights ADD COLUMN IF NOT EXISTS is_dismissed BOOLEAN DEFAULT FALSE",
        "ALTER TABLE insights ADD COLUMN IF NOT EXISTS created_at TIMESTAMP",
    ]:
        try:
            conn.execute(text(stmt))
            conn.commit()
        except Exception as e:
            print(f"Migration statement failed ({stmt}): {e}")
            conn.rollback()

scheduler = BackgroundScheduler()


# ── Pydantic models ──────────────────────────────────────────────────────────

class AskRequest(BaseModel):
    question: str


class SettingsRequest(BaseModel):
    auto_sync_enabled: bool
    sync_frequency_hours: int
    sync_email_count: int


# ── Helpers ──────────────────────────────────────────────────────────────────

def update_job_status(job_id: str, status: str):
    db: Session = SessionLocal()
    job = db.query(SyncJob).filter(SyncJob.id == job_id).first()
    if job:
        job.status = status
        db.commit()
    db.close()


def extract_email_body(payload: dict) -> str:
    mime_type = payload.get("mimeType", "")

    if mime_type == "text/plain":
        data = payload.get("body", {}).get("data", "")
        if data:
            return base64.urlsafe_b64decode(
                data + "=="
            ).decode("utf-8", errors="ignore")

    for part in payload.get("parts", []):
        if part.get("mimeType") == "text/plain":
            data = part.get("body", {}).get("data", "")
            if data:
                return base64.urlsafe_b64decode(
                    data + "=="
                ).decode("utf-8", errors="ignore")

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

    results = gmail.users().messages().list(
        userId="me",
        maxResults=max_results,
        q="newer_than:30d"
    ).execute()

    messages = results.get("messages", [])
    print(f"TOTAL GMAIL MESSAGES: {len(messages)}")

    emails = []

    for message in messages:
        print(f"PROCESSING MESSAGE {message['id']}")

        msg = gmail.users().messages().get(
            userId="me", id=message["id"]
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
                "signal": "no_reply"
            })

        if len(msgs) >= 3:
            candidates.append({
                "subject_key": f"volume:{sender_email}",
                "insight_type": "high_volume",
                "sender": display_name,
                "days_since_contact": days_since,
                "message_count": len(msgs),
                "signal": "high_volume"
            })

    return candidates


def save_insights(db: Session, user_email: str, insight_dicts: list):
    for ins in insight_dicts:
        subject_key = ins.get("subject_key")
        insight_type = ins.get("insight_type", "relationship")
        title = ins.get("title")

        if not subject_key or not title:
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
        else:
            db.add(Insight(
                id=str(uuid.uuid4()),
                user_email=user_email,
                insight_type=insight_type,
                title=title,
                description=ins.get("description", ""),
                subject_key=subject_key,
                is_dismissed=False,
                created_at=datetime.utcnow()
            ))


def process_sync(
    job_id: str,
    token,
    user_email: str,
    email_count: int = 100
):
    update_job_status(job_id, "fetching_emails")
    emails = fetch_recent_emails(token, max_results=email_count)

    update_job_status(job_id, "filtering_threads")
    update_job_status(job_id, "extracting_tasks")

    db: Session = SessionLocal()
    today = datetime.utcnow().strftime("%Y-%m-%d")

    for email_data in emails:
        existing_email = db.query(ProcessedEmail).filter(
            ProcessedEmail.gmail_message_id == email_data["gmail_message_id"],
            ProcessedEmail.user_email == user_email
        ).first()

        if existing_email:
            print("SKIPPING ALREADY PROCESSED EMAIL")
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

        chunks = chunk_text(email_data["body"])

        for i, chunk in enumerate(chunks):
            chunk_content = (
                f"Subject: {email_data['subject']}\n"
                f"From: {email_data['sender']}\n\n"
                f"{chunk}"
            )
            embedding = embed_text(chunk_content)

            email_chunk = EmailChunk(
                id=str(uuid.uuid4()),
                processed_email_id=email_id,
                user_email=user_email,
                chunk_index=i,
                content=chunk_content,
                embedding=embedding
            )
            db.add(email_chunk)

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

    db.close()

    update_job_status(job_id, "complete")


def run_auto_sync():
    db: Session = SessionLocal()
    try:
        now = datetime.utcnow()

        enabled_users = db.query(UserSettings).filter(
            UserSettings.auto_sync_enabled == True,
            UserSettings.google_refresh_token.isnot(None)
        ).all()

        for user_settings in enabled_users:
            if user_settings.last_auto_synced_at:
                next_sync = user_settings.last_auto_synced_at + timedelta(
                    hours=user_settings.sync_frequency_hours
                )
                if now < next_sync:
                    continue

            try:
                creds = Credentials(
                    token=None,
                    refresh_token=user_settings.google_refresh_token,
                    token_uri="https://oauth2.googleapis.com/token",
                    client_id=GOOGLE_CLIENT_ID,
                    client_secret=GOOGLE_CLIENT_SECRET
                )
                creds.refresh(GoogleRequest())

                token = {"access_token": creds.token}

                job_id = str(uuid.uuid4())
                job = SyncJob(id=job_id, status="queued")
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
    same_site="none",
    https_only=True,
    max_age=30 * 24 * 60 * 60
)

_allowed_origins = list({
    FRONTEND_URL,
    "https://beacon-ai-assistant.com",
    "https://www.beacon-ai-assistant.com",
})

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
    return await oauth.google.authorize_redirect(
        request,
        redirect_uri,
        access_type="offline",
        prompt="consent"
    )


@app.get("/auth/callback")
async def auth_callback(request: Request):
    try:
        token = await oauth.google.authorize_access_token(request)
        userinfo = token.get("userinfo")
        user_email = userinfo["email"]

        request.session["user_email"] = user_email
        request.session["user_name"] = userinfo["name"]
        request.session["google_token"] = token

        refresh_token = token.get("refresh_token")
        if refresh_token:
            db: Session = SessionLocal()
            settings = db.query(UserSettings).filter(
                UserSettings.user_email == user_email
            ).first()
            if settings:
                settings.google_refresh_token = refresh_token
            else:
                settings = UserSettings(
                    user_email=user_email,
                    google_refresh_token=refresh_token
                )
                db.add(settings)
            db.commit()
            db.close()

        return RedirectResponse(FRONTEND_URL)

    except Exception as e:
        return {"error": str(e)}


@app.get("/auth/status")
async def auth_status(request: Request):
    token = request.session.get("google_token")
    return {"authenticated": token is not None}


@app.post("/auth/logout")
async def logout(request: Request):
    request.session.clear()
    return {"success": True}


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
    user_email = request.session.get("user_email")

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
    token = request.session.get("google_token")
    if not token:
        return {"error": "Not authenticated"}

    user_email = request.session.get("user_email")
    db: Session = SessionLocal()

    settings = db.query(UserSettings).filter(
        UserSettings.user_email == user_email
    ).first()
    email_count = settings.sync_email_count if settings else 100

    job_id = str(uuid.uuid4())
    job = SyncJob(id=job_id, status="queued")
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
def get_sync_status(job_id: str):
    db: Session = SessionLocal()
    job = db.query(SyncJob).filter(SyncJob.id == job_id).first()

    if not job:
        db.close()
        return {"status": "not_found"}

    result = {"status": job.status}
    db.close()
    return result


@app.post("/tasks/{task_id}/complete")
def complete_task(task_id: str):
    db: Session = SessionLocal()
    task = db.query(Task).filter(Task.id == task_id).first()

    if not task:
        db.close()
        return {"error": "Task not found"}

    task.is_completed = True
    task.completed_at = datetime.utcnow()
    db.commit()
    db.close()
    return {"success": True}


@app.post("/tasks/{task_id}/reopen")
def reopen_task(task_id: str):
    db: Session = SessionLocal()
    task = db.query(Task).filter(Task.id == task_id).first()

    if not task:
        db.close()
        return {"error": "Task not found"}

    task.is_completed = False
    task.completed_at = None
    db.commit()
    db.close()
    return {"success": True}


@app.post("/tasks/{task_id}/hide")
def hide_task(task_id: str):
    db: Session = SessionLocal()
    task = db.query(Task).filter(Task.id == task_id).first()

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
def complete_notification(notification_id: str):
    db: Session = SessionLocal()
    n = db.query(Notification).filter(Notification.id == notification_id).first()

    if not n:
        db.close()
        return {"error": "Notification not found"}

    n.status = "completed"
    n.completed_at = datetime.utcnow()
    db.commit()
    db.close()
    return {"success": True}


@app.post("/notifications/{notification_id}/dismiss")
def dismiss_notification(notification_id: str):
    db: Session = SessionLocal()
    n = db.query(Notification).filter(Notification.id == notification_id).first()

    if not n:
        db.close()
        return {"error": "Notification not found"}

    n.status = "dismissed"
    db.commit()
    db.close()
    return {"success": True}


@app.post("/notifications/{notification_id}/reopen")
def reopen_notification(notification_id: str):
    db: Session = SessionLocal()
    n = db.query(Notification).filter(Notification.id == notification_id).first()

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
def snooze_notification(notification_id: str):
    db: Session = SessionLocal()
    n = db.query(Notification).filter(Notification.id == notification_id).first()

    if not n:
        db.close()
        return {"error": "Notification not found"}

    n.status = "snoozed"
    n.snoozed_until = datetime.utcnow() + timedelta(days=1)
    db.commit()
    db.close()
    return {"success": True}


@app.post("/notifications/{notification_id}/draft-reply")
def draft_reply(notification_id: str):
    db: Session = SessionLocal()
    n = db.query(Notification).filter(Notification.id == notification_id).first()

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


@app.get("/insights")
def get_insights(request: Request):
    user_email = request.session.get("user_email")
    if not user_email:
        return {"error": "Not authenticated"}

    db: Session = SessionLocal()
    insights = db.query(Insight).filter(
        Insight.user_email == user_email,
        Insight.is_dismissed == False
    ).order_by(Insight.created_at.desc()).limit(10).all()
    db.close()

    return {"insights": [
        {
            "id": i.id,
            "title": i.title,
            "description": i.description,
            "insight_type": i.insight_type,
            "created_at": i.created_at.isoformat() if i.created_at else None,
        }
        for i in insights
    ]}


@app.post("/insights/{insight_id}/dismiss")
def dismiss_insight(insight_id: str):
    db: Session = SessionLocal()
    insight = db.query(Insight).filter(Insight.id == insight_id).first()

    if not insight:
        db.close()
        return {"error": "Insight not found"}

    insight.is_dismissed = True
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
            "sync_email_count": 100
        }

    return {
        "auto_sync_enabled": settings.auto_sync_enabled,
        "sync_frequency_hours": settings.sync_frequency_hours,
        "sync_email_count": settings.sync_email_count
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


@app.get("/search")
def semantic_search(query: str, request: Request, limit: int = 10):
    user_email = request.session.get("user_email")
    if not user_email:
        return {"error": "Not authenticated"}

    query_embedding = embed_text(query)
    db: Session = SessionLocal()

    try:
        chunks = db.query(EmailChunk).filter(
            EmailChunk.user_email == user_email
        ).order_by(
            EmailChunk.embedding.cosine_distance(query_embedding)
        ).limit(limit * 3).all()

        results = []
        seen_email_ids = set()

        for chunk in chunks:
            if chunk.processed_email_id in seen_email_ids:
                continue

            seen_email_ids.add(chunk.processed_email_id)

            email = db.query(ProcessedEmail).filter(
                ProcessedEmail.id == chunk.processed_email_id
            ).first()

            results.append({
                "email_id": chunk.processed_email_id,
                "subject": email.subject if email else "",
                "sender": email.sender if email else "",
                "snippet": email.snippet if email else "",
                "chunk_preview": chunk.content[:300]
            })

            if len(results) >= limit:
                break

        return {"results": results}

    finally:
        db.close()


@app.post("/ask")
def ask_inbox(body: AskRequest, request: Request):
    user_email = request.session.get("user_email")
    if not user_email:
        return {"error": "Not authenticated"}

    question_embedding = embed_text(body.question)
    db: Session = SessionLocal()

    try:
        chunks = db.query(EmailChunk).filter(
            EmailChunk.user_email == user_email
        ).order_by(
            EmailChunk.embedding.cosine_distance(question_embedding)
        ).limit(5).all()

        context_chunks = [chunk.content for chunk in chunks]

        sources = []
        seen = set()

        for chunk in chunks:
            if chunk.processed_email_id in seen:
                continue
            seen.add(chunk.processed_email_id)

            email = db.query(ProcessedEmail).filter(
                ProcessedEmail.id == chunk.processed_email_id
            ).first()

            if email:
                sources.append({
                    "subject": email.subject,
                    "sender": email.sender
                })

        answer = generate_answer(body.question, context_chunks)
        return {"answer": answer, "sources": sources}

    finally:
        db.close()


@app.get("/gmail/messages")
async def get_gmail_messages(request: Request):
    token = request.session.get("google_token")
    if not token:
        return {"error": "Not authenticated"}

    credentials = Credentials(token=token["access_token"])
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
