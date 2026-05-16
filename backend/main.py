from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import threading
import time
import uuid
import random

from sqlalchemy.orm import Session

from database import SessionLocal
from database import engine
from database import Base

from models import Task
from models import SyncJob

from ai_service import extract_tasks

app = FastAPI()

Base.metadata.create_all(bind=engine)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5175"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

fake_emails = [
    """
Hey Alan,

Can you send over the updated insurance form by tomorrow?

Thanks,
Sarah
""",
    """
Hi Alan,

Just following up regarding the recruiter conversation.
Please send your availability for next week.

Best,
Mike
""",
    """
Alan,

We're still waiting on HOA approval documents.
I'll update you once I hear back.

- Jennifer
"""
]

def seed_tasks():

    db: Session = SessionLocal()

    existing = db.query(Task).count()

    if existing == 0:

        initial_tasks = [
            {
                "title": "Reply to Sam about proposal",
                "status": "Overdue · 2 days",
                "category": "you_owe",
                "priority": "high"
            },
            {
                "title": "Submit HOA document",
                "status": "Due tomorrow",
                "category": "you_owe",
                "priority": "high"
            }
        ]

        for task_data in initial_tasks:

            task = Task(
                id=str(uuid.uuid4()),
                **task_data
            )

            db.add(task)

        db.commit()

    db.close()

seed_tasks()

@app.get("/")
def root():
    return {"message": "Backend running"}

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

def process_sync(job_id: str):

    update_job_status(
        job_id,
        "fetching_emails"
    )

    time.sleep(2)

    update_job_status(
        job_id,
        "filtering_threads"
    )

    time.sleep(2)

    update_job_status(
        job_id,
        "extracting_tasks"
    )

    time.sleep(2)

    db: Session = SessionLocal()

    email = random.choice(fake_emails)

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
def start_sync():

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
        args=(job_id,)
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