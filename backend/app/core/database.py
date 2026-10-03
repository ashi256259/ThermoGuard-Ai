import logging
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from backend.app.core.config import settings

logger = logging.getLogger("thermoguard.database")

Base = declarative_base()

# Connection pooling options
engine_args = {
    "pool_pre_ping": True,
    "pool_recycle": 3600
}

# In Phase 1 or demo environments where PostgreSQL may not be running locally,
# the database engine is lazily initialized or falls back gracefully
engine = None
SessionLocal = None

def get_engine():
    global engine
    if engine is None:
        try:
            engine = create_engine(settings.DATABASE_URL, **engine_args)
            logger.info(f"Database engine initialized for {settings.DATABASE_URL.split('@')[-1]}")
        except Exception as e:
            logger.warning(f"Could not connect to PostgreSQL ({e}). Operating in in-memory / demo mode.")
            engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    return engine

def get_session():
    global SessionLocal
    if SessionLocal is None:
        SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=get_engine())
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
