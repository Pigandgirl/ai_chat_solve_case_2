from sqlalchemy import create_engine, Column, Integer, String, DateTime, Text, ForeignKey, BigInteger, Boolean, Float
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from .config import settings

import os
ASYNC_DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://law_user:law_pass_2024@postgres:5432/law_case_system")
SYNC_DATABASE_URL = ASYNC_DATABASE_URL.replace("+asyncpg", "+psycopg2")

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
    from .services.auth_service import auth_service
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
        await conn.execute(text(
            "ALTER TABLE case_documents ADD COLUMN IF NOT EXISTS category VARCHAR(100)"
        ))
        await conn.execute(text(
            "UPDATE case_documents SET category = '1_财政厅移交材料' WHERE category IS NULL"
        ))
        await conn.execute(text(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'user'"
        ))
        result = await conn.execute(
            text("SELECT id FROM users WHERE username = 'admin'")
        )
        admin_row = result.fetchone()
        if not admin_row:
            hashed = auth_service.hash_password("MIer20210101")
            await conn.execute(
                text("INSERT INTO users (username, password, phone, email, role) VALUES (:u, :p, :ph, :e, :r)"),
                {"u": "admin", "p": hashed, "ph": "00000000000", "e": "admin@legal.cn", "r": "admin"}
            )
