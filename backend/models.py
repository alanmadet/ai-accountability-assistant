from sqlalchemy import Column
from sqlalchemy import String

from database import Base
from sqlalchemy import Boolean

class Task(Base):

    __tablename__ = "tasks"

    id = Column(String, primary_key=True)

    title = Column(String)
    status = Column(String)
    category = Column(String)
    priority = Column(String)
    is_completed = Column(
    Boolean,
    default=False
    )

    is_hidden = Column(
        Boolean,
        default=False
    )

class SyncJob(Base):

    __tablename__ = "sync_jobs"

    id = Column(String, primary_key=True)

    status = Column(String)

class ProcessedEmail(Base):

    __tablename__ = "processed_emails"

    id = Column(
        String,
        primary_key=True
    )

    gmail_message_id = Column(
        String,
        unique=True,
        nullable=False
    )