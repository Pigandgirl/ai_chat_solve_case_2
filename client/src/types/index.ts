export interface User {
  id: string;
  username: string;
  phone: string;
  email?: string;
}

export interface CaseItem {
  _id: string;
  caseName: string;
  caseType: string;
  status: string;
  progress: number;
  summary: string;
  complainant: {
    companyName: string;
    address: string;
    complaintDate?: string;
    hasProtested?: string;
  };
  respondent: {
    companyName: string;
    address: string;
  };
  projectInfo: {
    projectName: string;
    projectCode: string;
    biddingCompany: string;
    purchaser: string;
    agency: string;
  };
  complaintItems: Array<{
    title: string;
    content: string;
    legalBasis: string;
  }>;
  analysisResult: {
    elements: object;
    facts: object;
    suggestions: string;
  };
  documents: DocumentItem[];
  createdAt: string;
  updatedAt: string;
}

export interface DocumentItem {
  _id: string;
  caseId: string;
  fileName: string;
  filePath: string;
  fileType: string;
  ocrContent: string;
  uploadedAt: string;
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