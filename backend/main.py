from fastapi import FastAPI
from fastapi import Request
from fastapi.middleware.cors import CORSMiddleware

from starlette.middleware.sessions import SessionMiddleware

import threading
import time
import uuid
import os

os.environ["OAUTHLIB_INSECURE_TRANSPORT"] = "1"

from sqlalchemy.orm import Session

from database import SessionLocal
from database import engine
from database import Base

from models import Task
from models import SyncJob

from ai_service import extract_tasks

from dotenv import load_dotenv

from authlib.integrations.starlette_client import OAuth

from googleapiclient.discovery import build
from google.oauth2.credentials import Credentials
from fastapi.responses import RedirectResponse

load_dotenv()

app = FastAPI()

app.add_middleware(
    SessionMiddleware,
    secret_key="super-secret-key",
    same_site="lax",
    https_only=False
)

GOOGLE_CLIENT_ID = os.getenv(
    "GOOGLE_CLIENT_ID"
)

GOOGLE_CLIENT_SECRET = os.getenv(
    "GOOGLE_CLIENT_SECRET"
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

Base.metadata.create_all(bind=engine)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5175"],
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
        "http://localhost:8000/auth/callback"
    )

    return await oauth.google.authorize_redirect(
        request,
        redirect_uri
    )

@app.get("/auth/callback")
async def auth_callback(request: Request):

    token = await oauth.google.authorize_access_token(
        request
    )

    request.session["google_token"] = token

    return RedirectResponse(
    "http://localhost:5175"
    )

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
        maxResults=5
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
        maxResults=5,
        q="newer_than:30d"
    ).execute()

    messages = results.get("messages", [])

    print("TOTAL GMAIL MESSAGES:")
    print(len(messages))

    email_texts = []

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

        email_content = f"""
Subject: {subject}

From: {sender}

Body:
{snippet}
"""

        print("EMAIL CONTENT:")
        print(email_content)

        email_texts.append(email_content)

    return email_texts

@app.get("/tasks")
def get_tasks():

    db: Session = SessionLocal()

    tasks = db.query(Task).all()

    result = []

    for task in tasks:

        result.append({
            "id": task.id,
            "title": task.title,
            "status": task.status,
            "category": task.category,
            "priority": task.priority
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

def process_sync(job_id: str, token):

    update_job_status(
        job_id,
        "fetching_emails"
    )


    email_texts = fetch_recent_emails(token)

    update_job_status(
        job_id,
        "filtering_threads"
    )


    update_job_status(
        job_id,
        "extracting_tasks"
    )


    db: Session = SessionLocal()

    for email in email_texts:

        extracted_tasks = extract_tasks(email)

        for task_data in extracted_tasks:

            task = Task(
                id=str(uuid.uuid4()),
                title=task_data["title"],
                status=task_data["status"],
                category=task_data["category"],
                priority=task_data["priority"]
            )

            db.add(task)

    db.commit()

    db.close()

    update_job_status(
        job_id,
        "generating_summary"
    )

    time.sleep(2)

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
        args=(job_id, token)
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
