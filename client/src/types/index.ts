export interface User {
  id: number;
  username: string;
  phone: string;
  email?: string;
  created_at?: string;
}

export interface CaseItem {
  id: number;
  case_name: string;
  case_type: string;
  status: string;
  progress: number;
  summary: string;
  processing_message?: string;
  complainant: Record<string, unknown>;
  respondent: Record<string, unknown>;
  project_info: Record<string, unknown>;
  complaint_items: Array<Record<string, unknown>>;
  analysis_result: Record<string, unknown>;
  user_id: number;
  created_at: string;
  updated_at: string;
  documents: DocumentItem[];
  processing_status?: ProcessingStatus | null;
}

export interface DocumentItem {
  id: number;
  case_id: number;
  original_name: string;
  storage_path: string;
  file_size: number;
  file_type: string;
  ocr_done: boolean;
  ocr_result_path?: string | null;
  ocr_confidence: number;
  page_count: number;
  is_scanned: boolean;
  error_message?: string | null;
  uploaded_at: string;
}

export interface ProcessingStatus {
  case_id: number;
  status: string;
  progress: number;
  error_message?: string | null;
  updated_at: string;
}

export interface WSProgressMessage {
  type: string;
  case_id: number;
  progress: number;
  status: string;
  message: string;
  case_name?: string;
  summary?: string;
  complainant?: Record<string, unknown>;
  respondent?: Record<string, unknown>;
  project_info?: Record<string, unknown>;
  complaint_items?: Array<Record<string, unknown>>;
}

export interface CaseListResponse {
  items: CaseItem[];
  total: number;
}

export interface LoginData {
  username: string;
  password: string;
}

export interface RegisterData {
  username: string;
  password: string;
  confirmPassword: string;
  phone: string;
  captcha: string;
}

export interface UploadResponse {
  message: string;
  case: CaseItem;
  documents: DocumentItem[];
  errors: Array<{ file: string; error: string }>;
}

export interface OCRResultResponse {
  document: DocumentItem;
  ocr_result: {
    file_name: string;
    total_pages: number;
    is_scanned: boolean;
    pages: Array<{
      page_num: number;
      text: string;
      confidence: number;
      blocks: Array<{
        text: string;
        bbox: number[];
        confidence: number;
      }>;
    }>;
    overall_confidence: number;
  };
  low_confidence_blocks: Array<{
    page_num: number;
    text: string;
    confidence: number;
  }>;
}
