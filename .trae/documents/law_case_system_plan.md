
# 法律智能办案系统 - 技术方案

## 一、需求分析

根据用户提供的界面设计图，系统需要实现以下核心功能：

### 1. 用户管理模块
- **登录界面**（图1）：账号密码登录、短信登录、记住账号、忘记密码
- **注册界面**（图2）：用户名、密码、手机号、图形验证码

### 2. 工作台模块（图3）
- 案件列表展示
- 案件筛选（名称、关键词、类型、日期范围）
- 新建案件功能
- 案件状态展示（进度百分比）
- 案件操作（办理、更多选项）

### 3. 案件详情分析模块（图4）
- 案件要素展示
  - 主体基本信息（投诉企业、被投诉企业等）
  - 案件事实信息（采购项目、中标企业等）
  - 投诉事项具体内容
- 左侧功能菜单（材料文档、案件要素、法律法规匹配、答复归纳、证据审查、文书生成）

### 4. 文档处理流程
- 上传案件附件（扫描件/PDF）
- 调用第三方OCR识别文档内容
- 调用Minimax API大模型分析文档
- 展示案件分析结果

---

## 二、技术架构设计

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                      前端层 (React)                         │
├─────────────────────────────────────────────────────────────┤
│  Login / Register / Workbench / CaseDetail / DocumentUpload│
└─────────────────────────────┬───────────────────────────────┘
                              │ HTTP/REST
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      后端层 (Node.js)                       │
├─────────────────────────────────────────────────────────────┤
│  AuthController / CaseController / DocumentController      │
│  OCRService / MinimaxService / FileStorageService          │
└─────────────────────────────┬───────────────────────────────┘
                              │ MongoDB
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    数据存储层 (MongoDB)                      │
├─────────────────────────────────────────────────────────────┤
│  users / cases / documents / analysis_results              │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 技术选型

| 分类 | 技术 | 版本 | 说明 |
|------|------|------|------|
| 前端框架 | React | 18.x | 用户界面开发 |
| 类型系统 | TypeScript | 5.x | 类型安全 |
| 样式框架 | TailwindCSS | 3.x | 快速样式开发 |
| 路由 | React Router | 6.x | 页面路由管理 |
| 状态管理 | Redux Toolkit | 2.x | 全局状态管理 |
| 后端框架 | Express | 4.x | API服务 |
| 数据库 | MongoDB | 7.x | 文档型数据库 |
| ORM | Mongoose | 8.x | MongoDB操作 |
| 文件存储 | Local Storage | - | 本地文件存储（可扩展至云存储） |
| OCR服务 | 百度OCR/腾讯OCR | - | 第三方文字识别 |
| AI服务 | Minimax API | - | 大模型分析 |

---

## 三、目录结构

```
ai_chat_solve_case_2/
├── client/                      # 前端代码
│   ├── public/                  # 静态资源
│   ├── src/
│   │   ├── components/          # 通用组件
│   │   │   ├── Layout/          # 布局组件
│   │   │   ├── Form/            # 表单组件
│   │   │   └── DataTable/       # 数据表格
│   │   ├── pages/               # 页面组件
│   │   │   ├── Login.tsx        # 登录页
│   │   │   ├── Register.tsx     # 注册页
│   │   │   ├── Workbench.tsx    # 工作台
│   │   │   └── CaseDetail.tsx   # 案件详情
│   │   ├── store/               # Redux状态管理
│   │   ├── api/                 # API请求封装
│   │   ├── types/               # TypeScript类型定义
│   │   └── App.tsx
│   ├── package.json
│   ├── tsconfig.json
│   └── tailwind.config.js
├── server/                      # 后端代码
│   ├── src/
│   │   ├── controllers/         # 控制器
│   │   │   ├── auth.controller.ts
│   │   │   ├── case.controller.ts
│   │   │   └── document.controller.ts
│   │   ├── services/            # 服务层
│   │   │   ├── ocr.service.ts
│   │   │   ├── minimax.service.ts
│   │   │   └── storage.service.ts
│   │   ├── models/              # 数据模型
│   │   │   ├── User.ts
│   │   │   ├── Case.ts
│   │   │   └── Document.ts
│   │   ├── routes/              # 路由配置
│   │   ├── middleware/          # 中间件
│   │   ├── config/              # 配置文件
│   │   └── app.ts
│   ├── package.json
│   └── tsconfig.json
├── .env                         # 环境变量
└── README.md
```

---

## 四、数据库设计

### 4.1 用户表 (users)

| 字段名 | 类型 | 说明 |
|--------|------|------|
| _id | ObjectId | 用户ID |
| username | string | 用户名 |
| password | string | 加密后的密码 |
| phone | string | 手机号 |
| email | string | 邮箱 |
| createdAt | Date | 创建时间 |
| updatedAt | Date | 更新时间 |

### 4.2 案件表 (cases)

| 字段名 | 类型 | 说明 |
|--------|------|------|
| _id | ObjectId | 案件ID |
| caseName | string | 案件名称 |
| caseType | string | 案件类型（招标投诉/招标审查） |
| status | string | 状态（待处理/处理中/已完成） |
| progress | number | 处理进度(0-100) |
| summary | string | 案件摘要 |
| complainant | object | 投诉企业信息 |
| respondent | object | 被投诉企业信息 |
| projectInfo | object | 采购项目信息 |
| complaintItems | array | 投诉事项列表 |
| analysisResult | object | AI分析结果 |
| documents | array | 关联文档ID |
| userId | ObjectId | 创建用户ID |
| createdAt | Date | 创建时间 |
| updatedAt | Date | 更新时间 |

### 4.3 文档表 (documents)

| 字段名 | 类型 | 说明 |
|--------|------|------|
| _id | ObjectId | 文档ID |
| caseId | ObjectId | 关联案件ID |
| fileName | string | 原始文件名 |
| filePath | string | 存储路径 |
| fileType | string | 文件类型 |
| ocrContent | string | OCR识别内容 |
| uploadedAt | Date | 上传时间 |

---

## 五、API接口设计

### 5.1 认证接口

| 接口 | 方法 | 路径 | 说明 |
|------|------|------|------|
| 用户注册 | POST | /api/auth/register | 新用户注册 |
| 用户登录 | POST | /api/auth/login | 用户登录 |
| 获取用户信息 | GET | /api/auth/me | 获取当前用户 |
| 修改密码 | PUT | /api/auth/password | 修改密码 |

### 5.2 案件接口

| 接口 | 方法 | 路径 | 说明 |
|------|------|------|------|
| 获取案件列表 | GET | /api/cases | 查询案件列表 |
| 获取案件详情 | GET | /api/cases/:id | 获取单个案件 |
| 创建案件 | POST | /api/cases | 新建案件 |
| 更新案件 | PUT | /api/cases/:id | 更新案件信息 |
| 删除案件 | DELETE | /api/cases/:id | 删除案件 |

### 5.3 文档接口

| 接口 | 方法 | 路径 | 说明 |
|------|------|------|------|
| 上传文档 | POST | /api/documents/upload | 上传案件附件 |
| OCR识别 | POST | /api/documents/ocr | 调用OCR识别 |
| AI分析 | POST | /api/documents/analyze | 调用Minimax分析 |
| 获取文档列表 | GET | /api/documents/:caseId | 获取案件文档 |

---

## 六、前端页面设计

### 6.1 登录页 (Login)
- 系统标题：粤省法智能办案系统
- 副标题：智能赋能执法办案 · 专业守护公平正义
- 登录卡片：账号登录/短信登录切换
- 输入框：用户名/手机号/邮箱、密码
- 功能按钮：记住账号、忘记密码、登录、立即注册

### 6.2 注册页 (Register)
- 输入框：用户名、密码、确认密码、手机号、图形验证码
- 功能按钮：换一张、立即注册、立即登录

### 6.3 工作台 (Workbench)
- 左侧导航：新建案件、退出登录
- 顶部筛选栏：案件名称、关键词、案件类型、日期范围
- 案件列表：状态进度、类型、名称、摘要、创建时间、操作列

### 6.4 案件详情 (CaseDetail)
- 左侧菜单：材料文档、案件要素、法律法规匹配、答复归纳、证据审查、文书生成
- 主体信息区：投诉企业、被投诉企业、地址、投诉日期等
- 案件事实区：采购项目名称、编号、中标企业、采购人、代理机构
- 投诉事项区：投诉内容、法律依据

---

## 七、部署与运行

### 7.1 环境要求
- Node.js >= 20.x
- MongoDB >= 7.x
- npm >= 10.x

### 7.2 启动命令
```bash
# 前端
cd client
npm install
npm run dev

# 后端
cd server
npm install
npm run dev
```

### 7.3 环境变量配置 (.env)
```
PORT=3001
MONGODB_URI=mongodb://localhost:27017/law_case_system
JWT_SECRET=your_jwt_secret
MINIMAX_API_KEY=your_minimax_api_key
OCR_API_KEY=your_ocr_api_key
```

---

## 八、开发计划

| 阶段 | 任务 | 预估时间 |
|------|------|----------|
| 第一阶段 | 项目初始化、基础架构搭建 | 2天 |
| 第二阶段 | 用户认证模块（登录/注册） | 2天 |
| 第三阶段 | 案件管理模块（CRUD） | 3天 |
| 第四阶段 | 文档上传与OCR识别 | 2天 |
| 第五阶段 | Minimax AI分析集成 | 2天 |
| 第六阶段 | 案件详情页面完善 | 3天 |
| 第七阶段 | 测试与优化 | 2天 |

---

## 九、风险与注意事项

1. **数据安全**：用户密码需加密存储，敏感信息传输需HTTPS
2. **文件存储**：文档存储需考虑容量限制和清理策略
3. **第三方服务依赖**：OCR和AI服务需处理API调用失败情况
4. **性能优化**：大文件上传需支持分片上传
5. **错误处理**：完善的错误处理和用户友好的提示信息

---

## 十、后续扩展

1. **文书自动生成**：根据案件分析结果自动生成法律文书
2. **法律法规匹配**：集成法律法规数据库进行智能匹配
3. **证据审查**：证据材料的管理和审查功能
4. **数据可视化**：案件统计分析图表
5. **移动端适配**：响应式设计或独立移动端应用
