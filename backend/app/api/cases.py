from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_
from typing import Optional, List

from ..database import get_db
from ..models.case import Case
from ..models.document import CaseDocument
from ..models.processing_status import CaseProcessingStatus
from ..models.user import User
from ..schemas.case import CaseCreate, CaseUpdate, AnalyzeRequest
from ..middleware.auth import get_current_user
from ..services.vector_service import vector_service
from ..services.llm_client import llm_client
from ..services.minio_service import minio_service
from ..services.case_element_service import extract_all_elements

router = APIRouter(prefix="/cases", tags=["cases"])


def _safe_isoformat(db_obj, attr_name: str):
    """Safely access a server-default datetime that may be expired."""
    try:
        val = getattr(db_obj, attr_name, None)
        return val.isoformat() if val else None
    except Exception:
        return None


def case_to_dict(case_obj, documents: List[dict] = None, proc_status: dict = None) -> dict:
    return {
        "id": case_obj.id,
        "case_name": case_obj.case_name,
        "case_type": case_obj.case_type,
        "status": case_obj.status,
        "progress": case_obj.progress or 0,
        "summary": case_obj.summary or "",
        "complainant": case_obj.complainant or {},
        "respondent": case_obj.respondent or {},
        "project_info": case_obj.project_info or {},
        "complaint_items": case_obj.complaint_items or [],
        "analysis_result": case_obj.analysis_result or {},
        "user_id": case_obj.user_id,
        "created_at": _safe_isoformat(case_obj, "created_at"),
        "updated_at": _safe_isoformat(case_obj, "updated_at"),
        "documents": documents or [],
        "processing_status": proc_status,
    }


def doc_to_dict(doc) -> dict:
    return {
        "id": doc.id,
        "case_id": doc.case_id,
        "original_name": doc.original_name,
        "storage_path": doc.storage_path,
        "file_size": doc.file_size or 0,
        "file_type": doc.file_type or "application/pdf",
        "ocr_done": doc.ocr_done or False,
        "ocr_result_path": doc.ocr_result_path,
        "ocr_confidence": doc.ocr_confidence or 0.0,
        "page_count": doc.page_count or 0,
        "is_scanned": doc.is_scanned or False,
        "error_message": doc.error_message,
        "uploaded_at": _safe_isoformat(doc, "uploaded_at"),
    }


def status_to_dict(status) -> Optional[dict]:
    if not status:
        return None
    return {
        "case_id": status.case_id,
        "status": status.status,
        "progress": status.progress or 0,
        "error_message": status.error_message,
        "updated_at": _safe_isoformat(status, "updated_at"),
    }


@router.get("")
async def get_cases(
    case_name: Optional[str] = Query(None),
    keywords: Optional[str] = Query(None),
    case_type: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conditions = [Case.user_id == current_user.id]
    if case_name:
        conditions.append(Case.case_name.ilike(f"%{case_name}%"))
    if keywords:
        conditions.append(
            or_(
                Case.case_name.ilike(f"%{keywords}%"),
                Case.summary.ilike(f"%{keywords}%"),
            )
        )
    if case_type:
        conditions.append(Case.case_type == case_type)

    query = select(Case).where(and_(*conditions)).order_by(Case.created_at.desc())
    result = await db.execute(query)
    cases = result.scalars().all()

    items = []
    for c in cases:
        doc_result = await db.execute(
            select(CaseDocument).where(CaseDocument.case_id == c.id)
        )
        docs = doc_result.scalars().all()
        status_result = await db.execute(
            select(CaseProcessingStatus).where(CaseProcessingStatus.case_id == c.id)
        )
        proc_status = status_result.scalar_one_or_none()

        items.append(case_to_dict(c, [doc_to_dict(d) for d in docs], status_to_dict(proc_status)))

    return {"items": items, "total": len(items)}


@router.get("/{case_id}")
async def get_case(
    case_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Case).where(and_(Case.id == case_id, Case.user_id == current_user.id))
    )
    case_obj = result.scalar_one_or_none()
    if not case_obj:
        raise HTTPException(status_code=404, detail="案件不存在")

    doc_result = await db.execute(
        select(CaseDocument).where(CaseDocument.case_id == case_obj.id)
    )
    docs = doc_result.scalars().all()
    status_result = await db.execute(
        select(CaseProcessingStatus).where(CaseProcessingStatus.case_id == case_obj.id)
    )
    proc_status = status_result.scalar_one_or_none()

    return case_to_dict(case_obj, [doc_to_dict(d) for d in docs], status_to_dict(proc_status))


@router.post("")
async def create_case(
    data: CaseCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    case_obj = Case(
        case_name=data.case_name or "待分析案件",
        case_type=data.case_type,
        summary=data.summary or "",
        user_id=current_user.id,
        status="待处理",
        progress=0,
        complainant={},
        respondent={},
        project_info={},
        complaint_items=[],
        analysis_result={},
    )
    db.add(case_obj)
    await db.flush()
    await db.refresh(case_obj)

    proc_status = CaseProcessingStatus(
        case_id=case_obj.id,
        status="pending",
        progress=0,
    )
    db.add(proc_status)

    return {"message": "案件创建成功", "case": case_to_dict(case_obj, [], None)}


@router.put("/{case_id}")
async def update_case(
    case_id: int,
    data: CaseUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Case).where(and_(Case.id == case_id, Case.user_id == current_user.id))
    )
    case_obj = result.scalar_one_or_none()
    if not case_obj:
        raise HTTPException(status_code=404, detail="案件不存在")

    if hasattr(data, "model_dump"):
        update_data = data.model_dump(exclude_unset=True)
    else:
        update_data = {}
        for key in dir(data):
            if not key.startswith("_"):
                update_data[key] = getattr(data, key)

    for key, value in update_data.items():
        if value is not None:
            setattr(case_obj, key, value)

    await db.flush()

    doc_result = await db.execute(
        select(CaseDocument).where(CaseDocument.case_id == case_obj.id)
    )
    docs = doc_result.scalars().all()
    status_result = await db.execute(
        select(CaseProcessingStatus).where(CaseProcessingStatus.case_id == case_obj.id)
    )
    proc_status = status_result.scalar_one_or_none()

    return {"message": "案件更新成功", "case": case_to_dict(case_obj, [doc_to_dict(d) for d in docs], status_to_dict(proc_status))}


@router.post("/{case_id}/analyze")
async def analyze_case(
    case_id: int,
    data: AnalyzeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Case).where(and_(Case.id == case_id, Case.user_id == current_user.id))
    )
    case_obj = result.scalar_one_or_none()
    if not case_obj:
        raise HTTPException(status_code=404, detail="案件不存在")

    retrieved = vector_service.retrieve_law(case_id, data.query, top_k=5)
    context_parts = []
    for i, chunk in enumerate(retrieved, 1):
        context_parts.append(f"[参考片段{i}] 来源:{chunk['metadata'].get('document_name','?')} 相似度:{chunk['score']:.2f}\n{chunk['content']}")
    context_text = "\n\n".join(context_parts) if context_parts else "（未找到相关文档内容，请基于通用法律知识回答）"

    system_prompt = (
        "你是一位资深法律分析师，服务于粤省法智能辅助办案系统。"
        "请严格基于以下案件文档内容进行分析，不要编造事实。"
        "如果文档中没有相关信息，请明确说明。"
    )
    user_message = (
        f"案件名称：{case_obj.case_name}\n"
        f"案件类型：{case_obj.case_type}\n"
        f"案件摘要：{case_obj.summary or '无'}\n\n"
        f"=== 案件文档参考内容 ===\n{context_text}\n=== 内容结束 ===\n\n"
        f"请基于以上文档内容回答：{data.query}"
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message},
    ]

    if data.stream:
        from fastapi.responses import StreamingResponse

        async def generate():
            async for token in llm_client.chat_stream(messages, max_tokens=2048, temperature=0.3):
                yield token

        return StreamingResponse(generate(), media_type="text/plain; charset=utf-8")

    answer = await llm_client.chat(messages, max_tokens=2048, temperature=0.3)

    return {
        "query": data.query,
        "answer": answer,
        "retrieved_chunks": [
            {
                "content": r["content"],
                "document_name": r["metadata"].get("document_name", "?"),
                "score": r["score"],
            }
            for r in retrieved
        ],
    }


@router.post("/{case_id}/extract-elements")
async def extract_case_elements(
    case_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Case).where(and_(Case.id == case_id, Case.user_id == current_user.id))
    )
    case_obj = result.scalar_one_or_none()
    if not case_obj:
        raise HTTPException(status_code=404, detail="案件不存在")

    elements = await extract_all_elements(case_id)

    if elements:
        case_obj.complainant = elements.get("complainant", {})
        case_obj.respondent = elements.get("respondent", {})
        case_obj.project_info = elements.get("project_info", {})
        case_obj.complaint_items = elements.get("complaint_items", [])
        await db.flush()

    return {
        "message": "案件要素提取完成",
        "elements": {
            "complainant": case_obj.complainant or {},
            "respondent": case_obj.respondent or {},
            "project_info": case_obj.project_info or {},
            "complaint_items": case_obj.complaint_items or [],
        },
    }


@router.delete("/{case_id}")
async def delete_case(
    case_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Case).where(and_(Case.id == case_id, Case.user_id == current_user.id))
    )
    case_obj = result.scalar_one_or_none()
    if not case_obj:
        raise HTTPException(status_code=404, detail="案件不存在")

    await db.delete(case_obj)
    return {"message": "案件删除成功"}
