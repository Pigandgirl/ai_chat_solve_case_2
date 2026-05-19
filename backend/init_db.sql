CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    email VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cases (
    id SERIAL PRIMARY KEY,
    case_name VARCHAR(200) NOT NULL DEFAULT '待分析案件',
    case_type VARCHAR(50) NOT NULL CHECK (case_type IN ('招标投诉', '招标审查')),
    status VARCHAR(20) NOT NULL DEFAULT '待处理' CHECK (status IN ('待处理', '处理中', '已完成', 'failed')),
    progress INTEGER DEFAULT 0,
    summary TEXT DEFAULT '',
    complainant JSONB DEFAULT '{}',
    respondent JSONB DEFAULT '{}',
    project_info JSONB DEFAULT '{}',
    complaint_items JSONB DEFAULT '[]',
    analysis_result JSONB DEFAULT '{}',
    user_id INTEGER NOT NULL REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS case_documents (
    id SERIAL PRIMARY KEY,
    case_id INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    original_name VARCHAR(255) NOT NULL,
    storage_path VARCHAR(500) NOT NULL,
    file_size BIGINT DEFAULT 0,
    file_type VARCHAR(50) DEFAULT 'application/pdf',
    ocr_done BOOLEAN DEFAULT FALSE,
    ocr_result_path VARCHAR(500),
    ocr_confidence FLOAT DEFAULT 0,
    page_count INTEGER DEFAULT 0,
    is_scanned BOOLEAN DEFAULT FALSE,
    category VARCHAR(100) DEFAULT '1_财政厅移交材料',
    error_message TEXT,
    analysis_done BOOLEAN DEFAULT FALSE,
    document_analysis TEXT,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_case_documents_case_id ON case_documents(case_id);

CREATE TABLE IF NOT EXISTS case_processing_status (
    case_id INTEGER PRIMARY KEY REFERENCES cases(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'ocr_processing', 'ocr_done', 'ai_processing', 'ai_done', 'failed')),
    progress INTEGER DEFAULT 0,
    error_message TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO users (username, password, phone, email) VALUES 
('admin', '$2a$10$Ng2ib.sM9Iku4jXWWbtLLu5emXsv1Z536KifSCa34GlWKelqjZ.36', '13800138000', 'admin@example.com')
ON CONFLICT (username) DO NOTHING;
