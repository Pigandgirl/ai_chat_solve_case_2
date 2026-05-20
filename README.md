
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
- 续传文档
- 删除案件
- 案件处理进度实时可视化（WebSocket + Redis Pub/Sub）

### 3. 案件详情分析
- **材料文档** — react-pdf 在线预览，滚轮自动翻页加载下一份/上一份文档
- **案件要素** — AI 自动提取
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

### 6. 数据仪表盘
- 案件总数、用户总数、文档总数、处理中文档数等核心指标卡片
- 案件类型分布可视化
- 近期案件处理趋势统计

### 7. 后台管理
- **用户管理** — 查看所有注册用户、启用/禁用用户账号
- **案件管理** — 全局案件列表，支持管理员删除任意案件
- **用户审计** — 操作日志完整记录（登录系统、上传文档、续传文档、删除文档、办理案件、筛选查询、下载文书），支持 20/50/100 条分页

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
| 前端 Web 服务器 | Nginx (生产环境) |

## 项目结构

```
ai_chat_solve_case_2/
├── client/                          # React 前端
│   ├── public/
│   ├── nginx/                       # Nginx 生产配置
│   └── src/
│       ├── api/                     # API 接口封装
│       ├── pages/                   # 页面组件
│       │   ├── Login.tsx            # 登录
│       │   ├── Register.tsx         # 注册
│       │   ├── Workbench.tsx        # 工作台首页
│       │   ├── CaseDetail.tsx       # 案件详情（PDF 查看 + AI 分析）
│       │   ├── Dashboard.tsx        # 数据仪表盘
│       │   ├── Admin.tsx            # 后台管理（用户/案件/审计）
│       │   └── OCRVerification.tsx  # OCR 校验
│       ├── store/slices/            # Redux 状态切片
│       └── types/                   # TypeScript 类型定义
├── backend/                         # Python FastAPI 后端
│   ├── app/
│   │   ├── api/                     # API 路由
│   │   │   ├── auth.py             # 用户认证
│   │   │   ├── cases.py            # 案件管理
│   │   │   ├── documents.py        # 文档管理
│   │   │   ├── admin.py            # 后台管理
│   │   │   └── dashboard.py        # 仪表盘
│   │   ├── models/                  # SQLAlchemy 数据模型
│   │   │   ├── user.py             # 用户模型
│   │   │   ├── case.py             # 案件模型
│   │   │   └── audit_log.py        # 审计日志模型
│   │   ├── schemas/                 # Pydantic 数据验证
│   │   ├── services/                # 业务逻辑层
│   │   ├── tasks/                   # Celery 异步任务
│   │   ├── middleware/              # JWT 认证中间件
│   │   ├── utils/                   # 工具函数
│   │   ├── database.py              # 数据库连接
│   │   └── config.py                # 配置
│   ├── Dockerfile
│   └── requirements.txt
├── server/                           # 早期 Express 后端（已废弃）
├── docker-compose.yml               # Docker 编排（根目录）
├── monitor.py                        # 系统监控脚本
└── README.md
```

## 部署前配置（重要）

启动系统前，**必须**先将以下文件中的 `your_key_input_here` 替换为你自己的真实密钥。

### Docker 部署（必须修改）

**`docker-compose.yml`**（根目录）
| 变量 | 位置 | 说明 | 获取地址 |
|------|------|------|----------|
| `SILICONFLOW_API_KEY` | celery_worker / fastapi 服务的 environment | OCR 识别与文本嵌入 | [SiliconCloud](https://cloud.siliconflow.cn) |
| `MINIMAX_API_KEY` | celery_worker / fastapi 服务的 environment | LLM 大语言模型 | [MiniMax](https://platform.minimaxi.com) |
| `JWT_SECRET` | fastapi 服务的 environment | JWT 签名密钥（自定义随机字符串即可） | 自行生成 |

**`backend/docker-compose.yml`**（等同于根目录的，两套配置保持同步）
| 变量 | 位置 |
|------|------|
| `SILICONFLOW_API_KEY` | celery_worker / fastapi 服务的 environment |
| `MINIMAX_API_KEY` | celery_worker / fastapi 服务的 environment |
| `JWT_SECRET` | fastapi 服务的 environment |

### 本地开发（可选修改）

**`backend/test_connectivity.py`** — 连通性测试脚本
| 变量 | 说明 |
|------|------|
| `MINIMAX_API_KEY` | MiniMax LLM API Key |
| `SILICONFLOW_API_KEY` | SiliconFlow API Key |

### 已废弃服务（可忽略）

- `server/src/services/minimaxLLM.ts` — 早期 Express 后端，已不再使用
- `server/src/services/siliconflow.ts` — 早期 Express 后端，已不再使用

## 快速开始

### 环境要求
- Docker + Docker Compose
- Node.js >= 16（仅前端开发）
- Python 3.11（仅后端本地开发）

### Docker 一键启动（推荐）

```bash
# 1. 先按上方「部署前配置」章节替换好 API 密钥
# 2. 在项目根目录执行
docker compose up -d
```

启动 6 个服务：postgres、redis、minio、celery_worker、fastapi、frontend。

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
| 前端 | http://localhost:3000 |
| API | http://localhost:8000 |
| API 文档 | http://localhost:8000/docs |
| MinIO 控制台 | http://localhost:9001 |

## 开发流程

1. 访问登录页面进行登录
2. 进入工作台查看案件列表
3. 点击"新建案件" → 上传 PDF 文档
4. 系统自动后台处理：OCR 识别 → AI 分析 → 向量索引 → 要素提取
5. 处理进度通过 WebSocket 实时推送
6. 案件完成后点击"办理"进入详情页面
7. 详情页可查看原始 PDF、案件要素、AI 分析结果
8. 低置信度 OCR 文本可人工校验修正
9. 管理员可访问仪表盘查看系统数据概览
10. 管理员可通过后台管理查看用户、案件和审计日志

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
| `CHROMA_PERSIST_DIR` | ChromaDB 持久化目录 |

## 待完善功能

- [ ] 法律法规匹配模块
- [ ] 证据审查模块
- [ ] 文书生成模块
- [ ] 答复归纳模块
- [ ] 权限管理系统

## License

MIT License
