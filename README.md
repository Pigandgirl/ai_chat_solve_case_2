# 粤省法智能办案系统

一个专门处理招标投诉案件的法律智能办案系统，支持文档上传、OCR识别、AI分析和文书生成等功能。

## 功能特性

### 1. 用户认证
- 用户注册（用户名、密码、手机号）
- 用户登录（账号密码登录）
- JWT 令牌认证

### 2. 工作台
- 案件列表展示
- 多维度筛选（名称、关键词、类型、日期范围）
- 新建案件
- 文档上传与处理流程
- 案件进度可视化

### 3. 案件详情分析
- **材料文档** - 查看上传的案件材料
- **案件要素** - 展示案件基本信息
  - 投诉企业信息
  - 被投诉企业信息  
  - 案件事实信息（采购项目、采购人等）
  - 投诉事项具体内容
- **法律法规匹配** - 匹配相关法律法规（待完善）
- **答复归纳** - 归纳案件答复内容（待完善）
- **证据审查** - 审查案件证据材料（待完善）
- **文书生成** - 生成法律文书（待完善）

## 技术栈

### 前端
- **框架**: React 18 + TypeScript
- **状态管理**: Redux Toolkit
- **路由**: React Router 6
- **样式**: TailwindCSS 3
- **HTTP 客户端**: Axios

### 后端
- **框架**: Express + TypeScript
- **认证**: JWT (jsonwebtoken)
- **密码加密**: bcryptjs
- **文件上传**: multer
- **数据持久化**: JSON 文件存储

## 项目结构

```
ai_chat_solve_case_2/
├── client/                 # 前端项目
│   ├── public/
│   └── src/
│       ├── api/           # API 接口
│       ├── components/    # 公共组件
│       ├── pages/         # 页面组件
│       ├── store/         # Redux 状态管理
│       ├── types/         # TypeScript 类型
│       ├── App.tsx
│       └── main.tsx
├── server/                 # 后端项目
│   ├── src/
│   │   ├── controllers/   # 控制器
│   │   ├── middleware/    # 中间件
│   │   ├── routes/        # 路由
│   │   ├── services/      # 服务层
│   │   ├── types/         # TypeScript 类型
│   │   ├── app.ts         # 应用入口
│   │   └── config.ts      # 配置文件
│   ├── data/              # JSON 数据文件（git 忽略）
│   └── uploads/           # 上传文件目录（git 忽略）
├── .gitignore
└── README.md
```

## 快速开始

### 环境要求
- Node.js >= 16
- npm 或 yarn

### 安装依赖

```bash
# 安装后端依赖
cd server
npm install

# 安装前端依赖
cd ../client
npm install
```

### 启动项目

```bash
# 启动后端服务 (端口: 3001)
cd server
npm run dev

# 启动前端开发服务 (端口: 3010)
cd ../client
npm start
```

### 访问应用

- 前端地址: http://localhost:3010
- 后端地址: http://localhost:3001

### 预置测试账号

| 用户名 | 密码 |
|--------|------|
| `admin` | `password` |

## 开发流程

1. 访问登录页面进行登录或注册
2. 进入工作台查看案件列表
3. 点击"新建案件"创建案件
4. 上传文档进行模拟 OCR 和 AI 分析
5. 案件分析完成后点击"办理"进入详情页面
6. 在详情页面左侧功能栏切换不同功能模块

## 数据持久化

项目使用 JSON 文件进行数据持久化存储，数据文件位于 `server/data/` 目录下：
- `users.json` - 用户数据
- `cases.json` - 案件数据
- `documents.json` - 文档数据

## 待完善功能

- [ ] 短信验证码登录
- [ ] 法律法规匹配模块
- [ ] 证据审查模块
- [ ] 文书生成模块
- [ ] 集成真实 OCR 服务
- [ ] 集成 minimax AI 大模型
- [ ] 权限管理系统

## License

MIT License