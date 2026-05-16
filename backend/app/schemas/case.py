from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, List, Any


class CaseCreate(BaseModel):
    case_name: str = Field(default="待分析案件", max_length=200)
    case_type: str = Field(..., description="招标投诉 / 招标审查")
    summary: str = Field(default="")

    class Config:
        from_attributes = True


class CaseUpdate(BaseModel):
    case_name: Optional[str] = None
    status: Optional[str] = None
    progress: Optional[int] = None
    summary: Optional[str] = None
    complainant: Optional[dict] = None
    respondent: Optional[dict] = None
    project_info: Optional[dict] = None
    complaint_items: Optional[list] = None
    analysis_result: Optional[dict] = None

    class Config:
        from_attributes = True


class CaseFilter(BaseModel):
    case_name: Optional[str] = None
    keywords: Optional[str] = None
    case_type: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None


class CaseDocumentResponse(BaseModel):
    id: int
    case_id: int
    original_name: str
    storage_path: str
    file_size: int
    file_type: str
    ocr_done: bool
    ocr_result_path: Optional[str] = None
    ocr_confidence: float
    page_count: int
    is_scanned: bool
    error_message: Optional[str] = None
    uploaded_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ProcessingStatusResponse(BaseModel):
    case_id: int
    status: str
    progress: int
    error_message: Optional[str] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class CaseResponse(BaseModel):
    id: int
    case_name: str
    case_type: str
    status: str
    progress: int
    summary: str
    complainant: dict
    respondent: dict
    project_info: dict
    complaint_items: list
    analysis_result: dict
    user_id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    documents: List[CaseDocumentResponse] = []
    processing_status: Optional[ProcessingStatusResponse] = None

    class Config:
        from_attributes = True


class CaseListResponse(BaseModel):
    items: List[CaseResponse]
    total: int


class DocumentUploadResponse(BaseModel):
    document: CaseDocumentResponse
    case: CaseResponse


class CorrectedOCRRequest(BaseModel):
    file_name: Optional[str] = None
    total_pages: Optional[int] = None
    is_scanned: Optional[bool] = None
    overall_confidence: Optional[float] = None
    pages: List[dict] = []
    error: Optional[str] = None

    class Config:
        from_attributes = True


class AnalyzeRequest(BaseModel):
    query: str = Field(..., description="分析查询，如'本案的争议焦点是什么'")
    stream: bool = Field(default=False)


class AnalyzeResponse(BaseModel):
    query: str
    answer: str
    retrieved_chunks: List[dict] = []


class WSProgressMessage(BaseModel):
    type: str = "progress"
    case_id: int
    progress: int
    status: str
    message: str = ""
