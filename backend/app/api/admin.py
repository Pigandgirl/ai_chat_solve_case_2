from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete
from typing import Optional

from ..database import get_db
from ..models.case import Case
from ..models.user import User
from ..models.audit_log import AuditLog
from ..middleware.auth import get_current_admin
from ..schemas.user import UserResponse, UserUpdate, AdminChangePassword
from ..services.auth_service import auth_service

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/users")
async def list_users(
    search: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    query = select(User)
    if search:
        query = query.where(User.username.ilike(f"%{search}%"))
    query = query.order_by(User.created_at.desc())
    result = await db.execute(query)
    users = result.scalars().all()

    return {
        "users": [
            {
                "id": u.id,
                "username": u.username,
                "phone": u.phone,
                "email": u.email,
                "role": u.role or "user",
                "created_at": u.created_at.isoformat() if u.created_at else None,
            }
            for u in users
        ]
    }


@router.put("/users/{user_id}")
async def update_user(
    user_id: int,
    data: UserUpdate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    if data.username is not None:
        dup = await db.execute(
            select(User).where(User.username == data.username, User.id != user_id)
        )
        if dup.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="用户名已被占用")
        user.username = data.username
    if data.phone is not None:
        user.phone = data.phone
    if data.role is not None:
        user.role = data.role

    await db.flush()
    return {"message": "用户更新成功"}


@router.put("/users/{user_id}/password")
async def admin_change_user_password(
    user_id: int,
    data: AdminChangePassword,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    result = await db.execute(select(User).where(User.id == user_id))
    target_user = result.scalar_one_or_none()
    if not target_user:
        raise HTTPException(status_code=404, detail="用户不存在")

    if not auth_service.verify_password(data.admin_password, current_admin.password):
        raise HTTPException(status_code=403, detail="管理员密码验证失败")

    target_user.password = auth_service.hash_password(data.new_password)
    await db.flush()
    return {"message": f"用户「{target_user.username}」的密码已更新"}


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    case_count_result = await db.execute(
        select(func.count(Case.id)).where(Case.user_id == user_id)
    )
    case_count = case_count_result.scalar() or 0

    await db.execute(delete(Case).where(Case.user_id == user_id))
    await db.delete(user)

    return {"message": f"用户已删除，同时清理了 {case_count} 个关联案件"}


@router.get("/cases")
async def list_all_cases(
    search: Optional[str] = Query(None),
    case_type: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    conditions = []
    if search:
        conditions.append(Case.case_name.ilike(f"%{search}%"))
    if case_type:
        conditions.append(Case.case_type == case_type)

    query = select(Case, User.username).join(User, Case.user_id == User.id)
    if conditions:
        from sqlalchemy import and_
        query = query.where(and_(*conditions))
    query = query.order_by(Case.created_at.desc())

    result = await db.execute(query)
    rows = result.all()

    return {
        "cases": [
            {
                "id": c.id,
                "username": username,
                "case_name": c.case_name,
                "case_type": c.case_type,
                "status": c.status,
                "progress": c.progress or 0,
                "user_id": c.user_id,
                "created_at": c.created_at.isoformat() if c.created_at else None,
            }
            for c, username in rows
        ]
    }


@router.delete("/cases/{case_id}")
async def admin_delete_case(
    case_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    result = await db.execute(select(Case).where(Case.id == case_id))
    case_obj = result.scalar_one_or_none()
    if not case_obj:
        raise HTTPException(status_code=404, detail="案件不存在")

    await db.delete(case_obj)
    return {"message": "案件已删除"}


@router.get("/audit-logs")
async def list_audit_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    count_query = select(func.count(AuditLog.id))
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    offset = (page - 1) * page_size
    query = select(AuditLog).order_by(AuditLog.created_at.desc()).offset(offset).limit(page_size)
    result = await db.execute(query)
    logs = result.scalars().all()

    return {
        "items": [
            {
                "id": log.id,
                "user_id": log.user_id,
                "username": log.username,
                "action": log.action,
                "created_at": log.created_at.isoformat() if log.created_at else None,
            }
            for log in logs
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size if total > 0 else 0,
    }
