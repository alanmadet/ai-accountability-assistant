from datetime import datetime

from sqlalchemy import Column, String, Boolean, Text, Integer, ForeignKey, DateTime, Float

from pgvector.sqlalchemy import Vector

from database import Base


class Task(Base):

    __tablename__ = "tasks"

    id = Column(String, primary_key=True)

    title = Column(String)
    status = Column(String)
    category = Column(String)
    priority = Column(String)

    is_completed = Column(Boolean, default=False)
    is_hidden = Column(Boolean, default=False)

    user_email = Column(String, nullable=False)

    completed_at = Column(DateTime, nullable=True)


class SyncJob(Base):

    __tablename__ = "sync_jobs"

    id = Column(String, primary_key=True)

    status = Column(String)
    user_email = Column(String, nullable=True)
    emails_synced = Column(Integer, default=0)
    emails_parsed = Column(Integer, default=0)
    emails_embedded = Column(Integer, default=0)
    embedding_failures = Column(Integer, default=0)
    indexed_chunks = Column(Integer, default=0)
    error = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)


class ProcessedEmail(Base):

    __tablename__ = "processed_emails"

    id = Column(String, primary_key=True)

    gmail_message_id = Column(String, unique=True, nullable=False)

    user_email = Column(String, nullable=False)

    sender = Column(String)
    sender_email = Column(String, nullable=True)
    subject = Column(String)
    snippet = Column(Text)
    body = Column(Text)
    unsubscribe_url = Column(String, nullable=True)
    rfc822_message_id = Column(String, nullable=True)

    thread_id = Column(String, nullable=True)
    received_at = Column(DateTime, nullable=True)
    content_hash = Column(String, nullable=True)
    embedded_at = Column(DateTime, nullable=True)


class Notification(Base):

    __tablename__ = "notifications"

    id = Column(String, primary_key=True)
    user_email = Column(String, nullable=False)

    title = Column(String)
    summary = Column(Text)
    reason = Column(Text)

    kind = Column(String)
    urgency = Column(String)
    confidence = Column(Integer, nullable=True)
    deadline = Column(DateTime, nullable=True)

    recommended_actions = Column(Text)
    ai_draft_reply = Column(Text, nullable=True)

    source_email_id = Column(
        String, ForeignKey("processed_emails.id"), nullable=True
    )
    sender = Column(String, nullable=True)
    subject = Column(String, nullable=True)

    status = Column(String, default="open")
    snoozed_until = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


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

    id = Column(String, primary_key=True)
    user_email = Column(String, nullable=False)
    insight_type = Column(String)
    title = Column(String)
    description = Column(Text)
    subject_key = Column(String, nullable=True)
    is_dismissed = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    status = Column(String, default="active")
    updated_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    expires_at = Column(DateTime, nullable=True)
    confidence = Column(Integer, nullable=True)
    priority = Column(String, nullable=True)
    score = Column(Float, nullable=True)
    evidence_email_ids = Column(Text, nullable=True)


class UserSettings(Base):

    __tablename__ = "user_settings"

    user_email = Column(String, primary_key=True)

    auto_sync_enabled = Column(Boolean, default=True)
    sync_frequency_hours = Column(Integer, default=1)
    sync_email_count = Column(Integer, default=100)

    google_refresh_token = Column(Text, nullable=True)
    google_access_token = Column(Text, nullable=True)
    google_token_expires_at = Column(DateTime, nullable=True)
    gmail_connected = Column(Boolean, default=False)
    last_auto_synced_at = Column(DateTime, nullable=True)


class AllowedUser(Base):
    __tablename__ = "allowed_users"

    id = Column(String, primary_key=True)
    email = Column(String, unique=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    invited_by = Column(String, nullable=True)
    status = Column(String, default="invited", nullable=False)
    last_login_at = Column(DateTime, nullable=True)


class InsightFeedback(Base):
    __tablename__ = "insight_feedback"

    id = Column(String, primary_key=True)
    insight_id = Column(String, ForeignKey("insights.id"), nullable=False)
    user_email = Column(String, nullable=False)
    useful = Column(Boolean, nullable=False)
    reason = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class IndexingStatus(Base):
    __tablename__ = "indexing_status"

    user_email = Column(String, primary_key=True)
    emails_synced = Column(Integer, default=0)
    emails_parsed = Column(Integer, default=0)
    emails_embedded = Column(Integer, default=0)
    embedding_failures = Column(Integer, default=0)
    indexed_chunks = Column(Integer, default=0)
    last_successful_indexing_at = Column(DateTime, nullable=True)


class OAuthState(Base):
    __tablename__ = "oauth_states"

    id = Column(String, primary_key=True)
    state_hash = Column(String, unique=True, nullable=False)
    state_data = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    expires_at = Column(DateTime, nullable=False)
