import psycopg2
import os

os.environ['PGPASSWORD'] = 'law_pass_2024'

conn = psycopg2.connect(
    host='localhost',
    port=5432,
    user='law_user',
    database='law_case_system',
    connect_timeout=10
)
cur = conn.cursor()

cur.execute('''CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    email VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)''')

cur.execute('''CREATE TABLE IF NOT EXISTS cases (
    id SERIAL PRIMARY KEY,
    case_name VARCHAR(200) NOT NULL DEFAULT 'test',
    case_type VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
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
)''')

cur.execute('''CREATE TABLE IF NOT EXISTS case_documents (
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
    error_message TEXT,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)''')

cur.execute('''CREATE TABLE IF NOT EXISTS case_processing_status (
    case_id INTEGER PRIMARY KEY REFERENCES cases(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'pending',
    progress INTEGER DEFAULT 0,
    error_message TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)''')

hashed_password = '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5Wj1Qv8v8a8Wq'

cur.execute(
    "INSERT INTO users (username, password, phone, email) VALUES (%s, %s, %s, %s) ON CONFLICT (username) DO NOTHING",
    ('admin', hashed_password, '13800138000', 'admin@example.com')
)

conn.commit()
cur.close()
conn.close()
print('Done')
