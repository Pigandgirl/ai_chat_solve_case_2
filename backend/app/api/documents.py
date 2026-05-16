from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from typing import List

from ..database import get_db
from ..models.case import Case
from ..models.document import CaseDocument
from ..models.processing_status import CaseProcessingStatus
from ..models.user import User
from ..schemas.case import CaseDocumentResponse, CorrectedOCRRequest
from ..services.minio_service import minio_service
from ..services.ocr_service import ocr_service
from ..middleware.auth import get_current_user
from ..tasks.process_case import process_case_documents
from ..config import settings
from .cases import case_to_dict, doc_to_dict, status_to_dict

router = APIRouter(prefix="/cases", tags=["documents"])


MAX_FILE_SIZE = settings.MAX_FILE_SIZE_MB * 1024 * 1024


@router.post("/{case_id}/upload", response_model=dict)
async def upload_documents(
    case_id: int,
    files: List[UploadFile] = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Case).where(and_(Case.id == case_id, Case.user_id == current_user.id))
    )
    case = result.scalar_one_or_none()
    if not case:
        raise HTTPException(status_code=404, detail="案件不存在")

    if len(files) < 1:
        raise HTTPException(status_code=400, detail="请至少上传1个PDF文件")
    if len(files) > settings.MAX_UPLOAD_FILES:
        raise HTTPException(status_code=400, detail=f"最多只能上传{settings.MAX_UPLOAD_FILES}个文件")

    uploaded_docs = []
    errors = []

    for file in files:
        if file.content_type != "application/pdf":
            errors.append({"file": file.filename, "error": "仅支持PDF文件"})
            continue

        content = await file.read()
        if len(content) > MAX_FILE_SIZE:
            errors.append({"file": file.filename, "error": f"文件大小超过{settings.MAX_FILE_SIZE_MB}MB限制"})
            continue

        try:
            upload_result = await minio_service.upload_pdf(
                case_id=case_id,
                file_content=content,
                original_name=file.filename,
            )

            document = CaseDocument(
                case_id=case_id,
                original_name=file.filename,
                storage_path=upload_result["storage_path"],
                file_size=upload_result["file_size"],
                file_type="application/pdf",
                ocr_done=False,
            )
            db.add(document)
            await db.flush()
            await db.refresh(document)
            uploaded_docs.append(document)

        except Exception as e:
            errors.append({"file": file.filename, "error": str(e)})

    case.status = "处理中"
    case.progress = 5
    await db.flush()

    await db.execute(
        select(CaseProcessingStatus).where(CaseProcessingStatus.case_id == case_id)
    )
    status_result_existing = await db.execute(
        select(CaseProcessingStatus).where(CaseProcessingStatus.case_id == case_id)
    )
    existing_status = status_result_existing.scalar_one_or_none()
    if existing_status:
        existing_status.status = "pending"
        existing_status.progress = 5
        proc_status_dict = {
            "case_id": case_id,
            "status": existing_status.status,
            "progress": existing_status.progress or 0,
            "error_message": existing_status.error_message,
            "updated_at": None,
        }
    else:
        proc_status = CaseProcessingStatus(case_id=case_id, status="pending", progress=5)
        db.add(proc_status)
        proc_status_dict = {
            "case_id": case_id,
            "status": "pending",
            "progress": 5,
            "error_message": None,
            "updated_at": None,
        }

    if uploaded_docs:
        process_case_documents.delay(case_id)

    doc_result = await db.execute(
        select(CaseDocument).where(CaseDocument.case_id == case_id)
    )
    all_docs = doc_result.scalars().all()

    return {
        "message": f"成功上传{len(uploaded_docs)}个文件" + (f"，{len(errors)}个文件失败" if errors else ""),
        "case": case_to_dict(case, [doc_to_dict(d) for d in all_docs], proc_status_dict),
        "documents": [doc_to_dict(d) for d in uploaded_docs],
        "errors": errors,
    }


@router.get("/{case_id}/documents", response_model=dict)
async def get_documents(
    case_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Case).where(and_(Case.id == case_id, Case.user_id == current_user.id))
    )
    case = result.scalar_one_or_none()
    if not case:
        raise HTTPException(status_code=404, detail="案件不存在")

    doc_result = await db.execute(
        select(CaseDocument).where(CaseDocument.case_id == case_id).order_by(CaseDocument.uploaded_at.asc())
    )
    documents = doc_result.scalars().all()

    return {
        "documents": [doc_to_dict(d) for d in documents],
    }


@router.get("/{case_id}/documents/{document_id}/ocr", response_model=dict)
async def get_ocr_result(
    case_id: int,
    document_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Case).where(and_(Case.id == case_id, Case.user_id == current_user.id))
    )
    case = result.scalar_one_or_none()
    if not case:
        raise HTTPException(status_code=404, detail="案件不存在")

    doc_result = await db.execute(
        select(CaseDocument).where(and_(CaseDocument.id == document_id, CaseDocument.case_id == case_id))
    )
    document = doc_result.scalar_one_or_none()
    if not document:
        raise HTTPException(status_code=404, detail="文档不存在")

    if not document.ocr_done or not document.ocr_result_path:
        raise HTTPException(status_code=404, detail="文档OCR结果尚未生成")

    try:
        ocr_data = await minio_service.get_ocr_result(document.ocr_result_path)
    except Exception:
        raise HTTPException(status_code=404, detail="OCR结果文件不存在或已损坏")

    low_conf_blocks = ocr_service.get_low_confidence_blocks(ocr_data)

    return {
        "document": doc_to_dict(document),
        "ocr_result": ocr_data,
        "low_confidence_blocks": low_conf_blocks,
    }


@router.put("/{case_id}/documents/{document_id}/ocr", response_model=dict)
async def update_ocr_result(
    case_id: int,
    document_id: int,
    corrected_ocr: CorrectedOCRRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Case).where(and_(Case.id == case_id, Case.user_id == current_user.id))
    )
    case = result.scalar_one_or_none()
    if not case:
        raise HTTPException(status_code=404, detail="案件不存在")

    doc_result = await db.execute(
        select(CaseDocument).where(and_(CaseDocument.id == document_id, CaseDocument.case_id == case_id))
    )
    document = doc_result.scalar_one_or_none()
    if not document:
        raise HTTPException(status_code=404, detail="文档不存在")

    ocr_path = await minio_service.upload_ocr_result(case_id, document_id, corrected_ocr.model_dump())
    document.ocr_result_path = ocr_path
    await db.flush()

    return {
        "message": "OCR结果已更新",
        "document": doc_to_dict(document),
    }


@router.post("/{case_id}/retry-document/{document_id}", response_model=dict)
async def retry_document_ocr(
    case_id: int,
    document_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Case).where(and_(Case.id == case_id, Case.user_id == current_user.id))
    )
    case = result.scalar_one_or_none()
    if not case:
        raise HTTPException(status_code=404, detail="案件不存在")

    doc_result = await db.execute(
        select(CaseDocument).where(and_(CaseDocument.id == document_id, CaseDocument.case_id == case_id))
    )
    document = doc_result.scalar_one_or_none()
    if not document:
        raise HTTPException(status_code=404, detail="文档不存在")

    document.ocr_done = False
    document.error_message = None
    await db.flush()

    process_case_documents.delay(case_id)

    return {"message": "已重新触发OCR处理", "document_id": document_id}
