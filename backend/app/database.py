from sqlalchemy import create_engine, Column, Integer, String, DateTime, Text, ForeignKey, BigInteger, Boolean, Float
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from .config import settings

SYNC_DATABASE_URL = "postgresql+psycopg2://law_user:law_pass_2024@postgres:5432/law_case_system"
ASYNC_DATABASE_URL = "postgresql+asyncpg://law_user:law_pass_2024@postgres:5432/law_case_system"

sync_engine = create_engine(SYNC_DATABASE_URL, echo=False, pool_size=5, pool_recycle=300)
SyncSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=sync_engine)

async_engine = create_async_engine(ASYNC_DATABASE_URL, echo=False)
async_session_factory = async_sessionmaker(async_engine, class_=AsyncSession, expire_on_commit=False)

Base = declarative_base()


def get_sync_db():
    db = SyncSessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


async def get_db() -> AsyncSession:
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db():
    from sqlalchemy import text
    for attempt in range(3):
        try:
            async with async_engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
            break
        except Exception:
            if attempt == 2:
                raise
            import asyncio
            await asyncio.sleep(1)
    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
