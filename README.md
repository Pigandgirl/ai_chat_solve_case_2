
# 粤省法智能辅助办案系统

法律文书智能分析平台，支持招标投诉、招标审查两类案件的 PDF 文档上传、OCR 识别、AI 文档分析、向量知识库构建与 RAG 法律问答。

## 功能特性

### 1. 用户认证
- 用户名+密码注册/登录
- 图形验证码
- JWT 令牌认证（HS256，7 天过期）
- bcrypt 密码哈希

### 2. 工作台
- 案件列表展示（表头固定、支持垂直滚动）
- 多维度筛选（名称、关键词、类型、日期范围）
- 新建案件 / 上传文档
- 续传文档（按目录分类上传：财政厅移交材料、代理机构答复、采购人答复、相关供应商答复、评审材料）
- 删除案件
- 案件处理进度实时可视化（WebSocket + Redis Pub/Sub）

### 3. 案件详情分析
- **材料文档** — react-pdf 在线预览，滚轮自动翻页加载下一份/上一份文档
- **案件要素** — AI 自动提取投诉企业、被投诉企业、项目信息、投诉事项
- **AI 信息分析** — 上传阶段预计算文档级分析，前端静态渲染（零等待）
- **法律法规匹配** — 基于 RAG 的法律智能问答（流式/普通两种输出模式）
- **答复归纳** — 待完善
- **证据审查** — 待完善
- **文书生成** — 待完善

### 4. OCR 识别流水线
- 自动检测扫描件 vs 文本型 PDF
- 图像预处理（降噪、CLAHE 增强、OTSU 二值化、倾斜校正）
- 扫描件通过 SiliconFlow PaddleOCR-VL 多模态模型识别
- 低置信度文本块高亮标记，支持人工校验修正

### 5. 向量知识库
- OCR 文本 → RecursiveCharacterTextSplitter 切割 → SiliconFlow BGE 嵌入 → ChromaDB 持久化
- 每个案件独立向量集合
- 支持相似度检索 + 引用片段

## 技术栈

### 前端
| 组件 | 技术 |
|------|------|
| 框架 | React 18 + TypeScript |
| 状态管理 | Redux Toolkit |
| 路由 | React Router 6 |
| 样式 | TailwindCSS 3 |
| HTTP | Axios |
| PDF 查看 | react-pdf + pdfjs-dist |

### 后端
| 组件 | 技术 |
|------|------|
| Web 框架 | FastAPI (Python 3.11) |
| 数据库 | PostgreSQL 16 + SQLAlchemy (async) |
| 任务队列 | Celery + Redis 7 |
| 对象存储 | MinIO (S3 兼容) |
| 向量数据库 | ChromaDB |
| OCR | SiliconFlow PaddleOCR-VL |
| 嵌入模型 | SiliconFlow BGE-large-zh-v1.5 |
| LLM | MiniMax M2.7-highspeed |
| 认证 | JWT + bcrypt (passlib) |
| 实时推送 | WebSocket + Redis Pub/Sub |

### 部署
| 组件 | 技术 |
|------|------|
| 容器化 | Docker + Docker Compose |
| ASGI 服务器 | Uvicorn |

## 项目结构

```
ai_chat_solve_case_2/
├── client/                       # React 前端
│   ├── public/
│   └── src/
│       ├── api/                  # API 接口封装
│       ├── pages/                # 页面组件
│       │   ├── Login.tsx         # 登录
│       │   ├── Register.tsx      # 注册
│       │   ├── Workbench.tsx     # 工作台首页
│       │   ├── CaseDetail.tsx    # 案件详情（PDF 查看 + AI 分析）
│       │   └── OCRVerification.tsx # OCR 校验
│       ├── store/slices/         # Redux 状态切片
│       └── types/                # TypeScript 类型定义
├── backend/                      # Python FastAPI 后端
│   ├── app/
│   │   ├── api/                  # API 路由
│   │   ├── models/               # SQLAlchemy 数据模型
│   │   ├── schemas/              # Pydantic 数据验证
│   │   ├── services/             # 业务逻辑层
│   │   ├── tasks/                # Celery 异步任务
│   │   ├── middleware/           # JWT 认证中间件
│   │   ├── database.py           # 数据库连接
│   │   └── config.py             # 配置
│   ├── docker-compose.yml        # Docker 编排
│   ├── Dockerfile
│   ├── requirements.txt
│   └── init_db.sql               # 数据库初始化 DDL
├── server/                       # 早期 Express 后端（已废弃）
└── README.md
```

## 快速开始

### 环境要求
- Docker + Docker Compose
- Node.js >= 16（仅前端开发）
- Python 3.11（仅后端本地开发）

### Docker 一键启动（推荐）

```bash
cd backend
docker compose up -d
```

启动 6 个服务：postgres、redis、minio、celery_worker、fastapi、smoke_test。

### 本地开发

```bash
# 后端
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# 前端
cd client
npm install
npm start
```

### 访问应用

| 服务 | 地址 |
|------|------|
| 前端 | http://localhost:3010 |
| API | http://localhost:8000 |
| API 文档 | http://localhost:8000/docs |
| MinIO 控制台 | http://localhost:9001 |

### 预置测试账号

| 用户名 | 密码 |
|--------|------|
| `admin` | `admin123` |

## 开发流程

1. 访问登录页面进行登录
2. 进入工作台查看案件列表
3. 点击"新建案件" → 上传 PDF 文档
4. 系统自动后台处理：OCR 识别 → AI 分析 → 向量索引 → 要素提取
5. 处理进度通过 WebSocket 实时推送
6. 案件完成后点击"办理"进入详情页面
7. 详情页可查看原始 PDF、案件要素、AI 分析结果
8. 低置信度 OCR 文本可人工校验修正

## 环境变量

后端环境变量通过 `docker-compose.yml` 注入，主要配置项：

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | PostgreSQL 连接串 |
| `REDIS_URL` | Redis 连接串 |
| `MINIO_*` | MinIO 访问密钥与地址 |
| `SILICONFLOW_API_KEY` | OCR / Embedding API Key |
| `MINIMAX_API_KEY` | LLM API Key |
| `JWT_SECRET` | JWT 签名密钥 |

## 待完善功能

- [ ] 短信验证码登录
- [ ] 法律法规匹配模块
- [ ] 证据审查模块
- [ ] 文书生成模块
- [ ] 答复归纳模块
- [ ] 权限管理系统

## License

MIT License
