from fastapi import FastAPI
from fastapi import Request
from fastapi.middleware.cors import CORSMiddleware

from starlette.middleware.sessions import SessionMiddleware
from models import ProcessedEmail
from models import EmailChunk

from pydantic import BaseModel

import threading
import uuid
import os
import base64

os.environ["OAUTHLIB_INSECURE_TRANSPORT"] = "1"

from sqlalchemy.orm import Session
from sqlalchemy import text

from database import SessionLocal
from database import engine
from database import Base

from models import Task
from models import SyncJob

from ai_service import extract_tasks
from ai_service import chunk_text
from ai_service import embed_text
from ai_service import generate_answer

from dotenv import load_dotenv

from authlib.integrations.starlette_client import OAuth

from googleapiclient.discovery import build
from google.oauth2.credentials import Credentials
from fastapi.responses import RedirectResponse

load_dotenv()

FRONTEND_URL = os.getenv(
    "FRONTEND_URL"
)

BACKEND_URL = os.getenv(
    "BACKEND_URL"
)

SESSION_SECRET = os.getenv(
    "SESSION_SECRET"
)

GOOGLE_CLIENT_ID = os.getenv(
    "GOOGLE_CLIENT_ID"
)

GOOGLE_CLIENT_SECRET = os.getenv(
    "GOOGLE_CLIENT_SECRET"
)

app = FastAPI()

app.add_middleware(
    SessionMiddleware,
    secret_key=SESSION_SECRET,
    same_site="none",
    https_only=True
)

SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly"
]

oauth = OAuth()

oauth.register(
    name="google",
    client_id=GOOGLE_CLIENT_ID,
    client_secret=GOOGLE_CLIENT_SECRET,
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={
        "scope": (
            "openid email profile "
            "https://www.googleapis.com/auth/gmail.readonly"
        )
    }
)

with engine.connect() as conn:
    conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
    conn.commit()

Base.metadata.create_all(bind=engine)


class AskRequest(BaseModel):
    question: str

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {"message": "Backend running"}


@app.get("/auth/login")
async def login(request: Request):

    redirect_uri = (
        f"{BACKEND_URL}/auth/callback"
    )

    return await oauth.google.authorize_redirect(
        request,
        redirect_uri,
        access_type="offline",
        prompt="consent"
    )


@app.get("/auth/callback")
async def auth_callback(request: Request):

    try:

        token = await oauth.google.authorize_access_token(
            request
        )

        userinfo = token.get("userinfo")

        request.session["user_email"] = (
            userinfo["email"]
        )

        request.session["user_name"] = (
            userinfo["name"]
        )

        request.session["google_token"] = token

        return RedirectResponse(
            FRONTEND_URL
        )

    except Exception as e:

        return {
            "error": str(e)
        }


@app.get("/auth/status")
async def auth_status(request: Request):

    token = request.session.get(
        "google_token"
    )

    return {
        "authenticated": token is not None
    }


@app.get("/gmail/messages")
async def get_gmail_messages(request: Request):

    token = request.session.get(
        "google_token"
    )

    if not token:

        return {
            "error": "Not authenticated"
        }

    credentials = Credentials(
        token=token["access_token"]
    )

    gmail = build(
        "gmail",
        "v1",
        credentials=credentials
    )

    results = gmail.users().messages().list(
        userId="me",
        maxResults=50
    ).execute()

    messages = results.get("messages", [])

    detailed_messages = []

    for message in messages:

        msg = gmail.users().messages().get(
            userId="me",
            id=message["id"]
        ).execute()

        headers = msg["payload"].get(
            "headers",
            []
        )

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

    return {
        "messages": detailed_messages
    }


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


def fetch_recent_emails(token):

    credentials = Credentials(
        token=token["access_token"]
    )

    gmail = build(
        "gmail",
        "v1",
        credentials=credentials
    )

    results = gmail.users().messages().list(
        userId="me",
        maxResults=100,
        q="newer_than:30d"
    ).execute()

    messages = results.get("messages", [])

    print("TOTAL GMAIL MESSAGES:")
    print(len(messages))

    emails = []

    for message in messages:

        print("PROCESSING MESSAGE")
        print(message["id"])

        msg = gmail.users().messages().get(
            userId="me",
            id=message["id"]
        ).execute()

        headers = msg["payload"].get(
            "headers",
            []
        )

        subject = ""
        sender = ""

        for header in headers:

            if header["name"] == "Subject":
                subject = header["value"]

            if header["name"] == "From":
                sender = header["value"]

        snippet = msg.get(
            "snippet",
            "No preview available"
        )

        body = extract_email_body(
            msg["payload"]
        ) or snippet

        email_content = f"""
Subject: {subject}

From: {sender}

Body:
{body}
"""

        print("EMAIL CONTENT:")
        print(email_content)

        emails.append({
            "gmail_message_id": message["id"],
            "content": email_content,
            "sender": sender,
            "subject": subject,
            "snippet": snippet,
            "body": body
        })

    return emails


@app.get("/tasks")
def get_tasks(request: Request):

    db: Session = SessionLocal()

    user_email = request.session.get(
        "user_email"
    )

    tasks = db.query(Task).filter(
        Task.user_email == user_email,
        Task.is_completed == False,
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
        })

    db.close()

    return {"tasks": result}


def update_job_status(job_id: str, status: str):

    db: Session = SessionLocal()

    job = db.query(SyncJob).filter(
        SyncJob.id == job_id
    ).first()

    if job:
        job.status = status
        db.commit()

    db.close()


def process_sync(
    job_id: str,
    token,
    user_email: str
):

    update_job_status(
        job_id,
        "fetching_emails"
    )

    emails = fetch_recent_emails(token)

    update_job_status(
        job_id,
        "filtering_threads"
    )

    update_job_status(
        job_id,
        "extracting_tasks"
    )

    db: Session = SessionLocal()

    for email_data in emails:

        existing_email = db.query(
            ProcessedEmail
        ).filter(
            ProcessedEmail.gmail_message_id
            == email_data["gmail_message_id"],
            ProcessedEmail.user_email
            == user_email
        ).first()

        if existing_email:

            print(
                "SKIPPING ALREADY PROCESSED EMAIL"
            )

            continue

        extracted_tasks = extract_tasks(
            email_data["content"]
        )

        for task_data in extracted_tasks:

            existing_task = db.query(Task).filter(
                Task.title == task_data["title"]
            ).first()

            if existing_task:

                print(
                    "SKIPPING DUPLICATE TASK"
                )

                continue

            task = Task(
                id=str(uuid.uuid4()),
                title=task_data["title"],
                status=task_data["status"],
                category=task_data["category"],
                priority=task_data["priority"],
                user_email=user_email
            )

            db.add(task)

        email_id = str(uuid.uuid4())

        processed_email = ProcessedEmail(
            id=email_id,
            gmail_message_id=email_data[
                "gmail_message_id"
            ],
            user_email=user_email,
            sender=email_data["sender"],
            subject=email_data["subject"],
            snippet=email_data["snippet"],
            body=email_data["body"]
        )

        db.add(processed_email)
        db.flush()

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

    db.close()

    update_job_status(
        job_id,
        "generating_summary"
    )

    update_job_status(
        job_id,
        "complete"
    )


@app.post("/sync")
async def start_sync(request: Request):

    token = request.session.get(
        "google_token"
    )

    if not token:

        return {
            "error": "Not authenticated"
        }

    db: Session = SessionLocal()

    job_id = str(uuid.uuid4())

    job = SyncJob(
        id=job_id,
        status="queued"
    )

    db.add(job)

    db.commit()

    db.close()

    thread = threading.Thread(
        target=process_sync,
        args=(
            job_id,
            token,
            request.session["user_email"]
        )
    )

    thread.start()

    return {
        "job_id": job_id
    }


@app.get("/sync-status/{job_id}")
def get_sync_status(job_id: str):

    db: Session = SessionLocal()

    job = db.query(SyncJob).filter(
        SyncJob.id == job_id
    ).first()

    if not job:

        db.close()

        return {
            "status": "not_found"
        }

    result = {
        "status": job.status
    }

    db.close()

    return result


@app.post("/tasks/{task_id}/complete")
def complete_task(task_id: str):

    db: Session = SessionLocal()

    task = db.query(Task).filter(
        Task.id == task_id
    ).first()

    if not task:

        db.close()

        return {
            "error": "Task not found"
        }

    task.is_completed = True

    db.commit()

    db.close()

    return {
        "success": True
    }


@app.post("/tasks/{task_id}/hide")
def hide_task(task_id: str):

    db: Session = SessionLocal()

    task = db.query(Task).filter(
        Task.id == task_id
    ).first()

    if not task:

        db.close()

        return {
            "error": "Task not found"
        }

    task.is_hidden = True

    db.commit()

    db.close()

    return {
        "success": True
    }


@app.post("/auth/logout")
async def logout(request: Request):

    request.session.clear()

    return {
        "success": True
    }


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

        return {
            "answer": answer,
            "sources": sources
        }

    finally:
        db.close()


@app.get("/me")
def get_me(request: Request):

    user_email = request.session.get(
        "user_email"
    )

    if not user_email:

        return {
            "authenticated": False
        }

    return {
        "authenticated": True,
        "email": user_email,
        "name": request.session.get(
            "user_name",
            ""
        )
    }