from sqlalchemy import Column
from sqlalchemy import String

from database import Base

class Task(Base):

    __tablename__ = "tasks"

    id = Column(String, primary_key=True)

    title = Column(String)
    status = Column(String)
    category = Column(String)
    priority = Column(String)

class SyncJob(Base):

    __tablename__ = "sync_jobs"

    id = Column(String, primary_key=True)

    status = Column(String)