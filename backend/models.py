from sqlalchemy import Column
from sqlalchemy import String
from sqlalchemy import Boolean
from sqlalchemy import Text
from sqlalchemy import Integer
from sqlalchemy import ForeignKey

from pgvector.sqlalchemy import Vector

from database import Base


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

    user_email = Column(
        String,
        nullable=False
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

    user_email = Column(
        String,
        nullable=False
    )

    sender = Column(String)

    subject = Column(String)

    snippet = Column(Text)

    body = Column(Text)


class EmailChunk(Base):

    __tablename__ = "email_chunks"

    id = Column(String, primary_key=True)

    processed_email_id = Column(
        String,
        ForeignKey("processed_emails.id"),
        nullable=False
    )

    user_email = Column(String, nullable=False)

    chunk_index = Column(Integer, nullable=False)

    content = Column(Text, nullable=False)

    embedding = Column(Vector(1536))


class Insight(Base):

    __tablename__ = "insights"

    id = Column(
        String,
        primary_key=True
    )

    user_email = Column(
        String,
        nullable=False
    )

    insight_type = Column(String)

    title = Column(String)

    description = Column(Text)