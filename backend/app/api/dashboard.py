from collections import Counter

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from ..database import get_db
from ..models.case import Case
from ..models.processing_status import CaseProcessingStatus
from ..models.user import User
from ..middleware.auth import get_current_user
from ..utils.address_parser import extract_province_from_case

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/stats")
async def get_dashboard_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    total_users_result = await db.execute(select(func.count(User.id)))
    total_users = total_users_result.scalar() or 0

    total_cases_result = await db.execute(select(func.count(Case.id)))
    total_cases = total_cases_result.scalar() or 0

    handling_result = await db.execute(
        select(func.count(CaseProcessingStatus.case_id)).where(
            CaseProcessingStatus.status == "processing"
        )
    )
    handling_count = handling_result.scalar() or 0

    processing_result = await db.execute(
        select(func.count(Case.id)).where(Case.status == "处理中")
    )
    processing_count = processing_result.scalar() or 0

    pending_result = await db.execute(
        select(func.count(Case.id)).where(Case.status == "待处理")
    )
    pending_count = pending_result.scalar() or 0

    completed_result = await db.execute(
        select(func.count(Case.id)).where(Case.status == "已完成")
    )
    completed_count = completed_result.scalar() or 0

    cases_result = await db.execute(select(Case))
    all_cases = cases_result.scalars().all()

    province_counter: Counter = Counter()
    for c in all_cases:
        case_dict = {
            "complainant": c.complainant or {},
            "respondent": c.respondent or {},
            "project_info": c.project_info or {},
        }
        province = extract_province_from_case(case_dict)
        if province:
            province_counter[province] += 1

    province_distribution = [
        {"name": province, "value": count}
        for province, count in province_counter.most_common()
    ]
    region_count = len(province_distribution)

    case_type_result = await db.execute(
        select(Case.case_type, func.count(Case.id)).group_by(Case.case_type)
    )
    case_type_distribution = [
        {"name": row[0] or "未知", "value": row[1]}
        for row in case_type_result.all()
    ]

    return {
        "total_users": total_users,
        "total_cases": total_cases,
        "handling": handling_count,
        "processing": processing_count,
        "status_breakdown": {
            "pending": pending_count,
            "processing": processing_count,
            "completed": completed_count,
        },
        "province_distribution": province_distribution,
        "region_count": region_count,
        "case_type_distribution": case_type_distribution,
    }
