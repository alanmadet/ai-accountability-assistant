"""Small transactional migration runner designed for concurrent ECS starts."""
from pathlib import Path

from sqlalchemy import text


MIGRATIONS_DIR = Path(__file__).with_name("migrations")
LOCK_ID = 19420613


def run_migrations(engine) -> None:
    migrations = sorted(MIGRATIONS_DIR.glob("*.sql"))
    with engine.begin() as conn:
        if conn.dialect.name == "postgresql":
            conn.execute(text("SELECT pg_advisory_xact_lock(:id)"), {"id": LOCK_ID})
        conn.execute(text(
            "CREATE TABLE IF NOT EXISTS schema_migrations ("
            "version VARCHAR PRIMARY KEY, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)"
        ))
        applied = {
            row[0] for row in conn.execute(text("SELECT version FROM schema_migrations"))
        }
        for migration in migrations:
            version = migration.stem
            if version in applied:
                continue
            sql = migration.read_text(encoding="utf-8")
            for statement in (part.strip() for part in sql.split(";")):
                if statement:
                    conn.execute(text(statement))
            conn.execute(
                text("INSERT INTO schema_migrations (version) VALUES (:version)"),
                {"version": version},
            )
