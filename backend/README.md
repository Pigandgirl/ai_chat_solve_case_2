# 法律智能辅助办案系统 - Python FastAPI 后端

## 技术架构

- **API 框架**: FastAPI + Uvicorn
- **数据库**: PostgreSQL 16
- **对象存储**: MinIO (S3 兼容)
- **任务队列**: Celery + Redis
- **OCR 引擎**: PaddleOCR + PyMuPDF + OpenCV
- **实时通信**: WebSocket

## 快速启动

### 方式一：Docker Compose (推荐)

```bash
cd backend
docker-compose up -d
```

服务启动后：
- **API 服务**: http://localhost:8000
- **API 文档**: http://localhost:8000/docs
- **MinIO Console**: http://localhost:9001 (账号: minioadmin / 密码: minioadmin123)
- **MinIO API**: http://localhost:9000

### 方式二：本地开发

1. 安装依赖
```bash
pip install -r requirements.txt
```

2. 启动基础设施
```bash
docker-compose up -d postgres redis minio
```

3. 启动 FastAPI
```bash
uvicorn app.main:app --reload --port 8000
```

4. 启动 Celery Worker (新终端)
```bash
celery -A app.tasks.celery_app worker --loglevel=info
```

## 环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| DATABASE_URL | postgresql+asyncpg://law_user:law_pass_2024@localhost:5432/law_case_system | 数据库连接 |
| REDIS_URL | redis://localhost:6379/0 | Redis 连接 |
| MINIO_ENDPOINT | localhost:9000 | MinIO 服务地址 |
| MINIO_ACCESS_KEY | minioadmin | MinIO 访问密钥 |
| MINIO_SECRET_KEY | minioadmin123 | MinIO 秘密密钥 |
| JWT_SECRET | law_case_jwt_secret_2024 | JWT 签名密钥 |

## API 接口

### 认证接口

- `POST /api/auth/register` - 用户注册
- `POST /api/auth/login` - 用户登录
- `GET /api/auth/me` - 获取当前用户信息

### 案件接口

- `GET /api/cases` - 获取案件列表 (支持分页、筛选)
- `GET /api/cases/{id}` - 获取案件详情
- `POST /api/cases` - 创建案件
- `PUT /api/cases/{id}` - 更新案件
- `DELETE /api/cases/{id}` - 删除案件

### 文档接口

- `POST /api/cases/{case_id}/upload` - 上传文档 (支持多文件，最多10个，单文件≤50MB)
- `GET /api/cases/{case_id}/documents` - 获取案件文档列表
- `GET /api/cases/{case_id}/documents/{document_id}/ocr` - 获取 OCR 结果
- `PUT /api/cases/{case_id}/documents/{document_id}/ocr` - 更新 OCR 结果 (人工修正)
- `POST /api/cases/{case_id}/retry-document/{document_id}` - 重试失败文档的 OCR

### WebSocket

- `WS /ws/case/{case_id}` - 案件处理进度实时推送

## 数据库表结构

### users
用户表

### cases
案件表

### case_documents
案件文档表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | SERIAL | 主键 |
| case_id | INTEGER | 所属案件 |
| original_name | VARCHAR(255) | 原文件名 |
| storage_path | VARCHAR(500) | MinIO 存储路径 |
| file_size | BIGINT | 文件大小 |
| ocr_done | BOOLEAN | OCR 是否完成 |
| ocr_confidence | FLOAT | OCR 置信度 |
| is_scanned | BOOLEAN | 是否为扫描件 |

### case_processing_status
案件处理状态表

| 字段 | 类型 | 说明 |
|------|------|------|
| case_id | INTEGER | 主键，关联案件 |
| status | VARCHAR(20) | pending/ocr_processing/ocr_done/ai_processing/ai_done/failed |
| progress | INTEGER | 进度 0-100 |
| error_message | TEXT | 错误信息 |

## OCR 处理流程

1. **上传阶段**: PDF 文件上传至 MinIO，同时写入数据库
2. **扫描检测**: 判断 PDF 是扫描件还是文本件 (平均每页字符数 < 100 为扫描件)
3. **文本 PDF**: 直接用 PyMuPDF 提取文字
4. **扫描件**: 每页转换为图片 → OpenCV 预处理 → PaddleOCR 识别
5. **结果存储**: OCR 结果存储为 JSON 文件至 MinIO
6. **进度推送**: 通过 Redis pub/sub + WebSocket 推送处理进度

## 前端配置

前端已配置代理到 `http://localhost:8000`，开发时直接运行：

```bash
cd client
npm install
npm start
```

## 默认账户

- 用户名: admin
- 密码: 123456

## 技术亮点

1. **异步处理**: 文件上传立即返回，OCR 在 Celery 后台异步执行
2. **实时进度**: WebSocket + Redis pub/sub 实现毫秒级进度推送
3. **智能识别**: 自动区分扫描件和文本件，适用不同处理策略
4. **图像增强**: OpenCV 去噪、二值化、倾斜校正提升识别准确率
5. **人工校正**: 支持对低置信度文本进行人工修正并回存
