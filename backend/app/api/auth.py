from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..database import get_db, async_engine
from ..models.user import User
from ..models.audit_log import AuditLog
from ..schemas.user import UserCreate, UserLogin, UserResponse, TokenResponse
from ..services.auth_service import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register")
async def register(data: UserCreate, db: AsyncSession = Depends(get_db)):
    if data.password != data.confirmPassword:
        raise HTTPException(status_code=400, detail="两次密码输入不一致")

    result = await db.execute(select(User).where(User.username == data.username))
    existing = result.scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")

    user = User(
        username=data.username,
        password=auth_service.hash_password(data.password),
        phone=data.phone,
        email=None,
        role="user",
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)

    token = auth_service.create_token(user.id, user.username, user.role)

    return {
        "message": "Registration successful",
        "token": token,
        "user": UserResponse.model_validate(user).model_dump(),
    }


@router.post("/login")
async def login(data: UserLogin):
    from sqlalchemy import text
    async with async_engine.connect() as conn:
        result = await conn.execute(text("SELECT * FROM users WHERE username = :username"), {"username": data.username})
        row = result.fetchone()
        
        if not row:
            raise HTTPException(status_code=401, detail="Invalid username or password")
        
        user_dict = {
            "id": row[0],
            "username": row[1],
            "password": row[2],
            "phone": row[3],
            "email": row[4],
            "created_at": row[5],
            "updated_at": row[6],
            "role": row[7] if len(row) > 7 else "user",
        }
        
        if not auth_service.verify_password(data.password, user_dict["password"]):
            raise HTTPException(status_code=401, detail="Invalid username or password")
        
        token = auth_service.create_token(user_dict["id"], user_dict["username"], user_dict["role"])

        await conn.execute(
            text("INSERT INTO audit_logs (user_id, username, action) VALUES (:uid, :un, :act)"),
            {"uid": user_dict["id"], "un": user_dict["username"], "act": "登录系统"}
        )
        await conn.commit()

        return {
            "message": "Login successful",
            "token": token,
            "user": {
                "id": user_dict["id"],
                "username": user_dict["username"],
                "phone": user_dict["phone"],
                "email": user_dict["email"],
                "role": user_dict["role"],
                "created_at": str(user_dict["created_at"]) if user_dict["created_at"] else None
            }
        }


@router.get("/me")
async def get_current_user_info(request: Request):
    authorization = request.headers.get("Authorization")
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")

    token = authorization.replace("Bearer ", "")
    payload = auth_service.decode_token(token)
    if payload is None:
        raise HTTPException(status_code=401, detail="Invalid token")

    user_id = int(payload.get("sub"))

    from sqlalchemy import text
    async with async_engine.connect() as conn:
        result = await conn.execute(text("SELECT id, username, phone, email, role, created_at FROM users WHERE id = :id"), {"id": user_id})
        row = result.fetchone()

        if not row:
            raise HTTPException(status_code=401, detail="User not found")

        return {
            "user": {
                "id": row[0],
                "username": row[1],
                "phone": row[2],
                "email": row[3],
                "role": row[4],
                "created_at": str(row[5]) if row[5] else None
            }
        }
