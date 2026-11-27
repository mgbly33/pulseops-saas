# PulseOps — 商业增长 SaaS 数据分析与运营管理平台

> 对标 Linear / Stripe Dashboard / PostHog 体验的现代 B2B 商业增长与营收运营（RevOps）SaaS 平台，支持多租户工作区隔离、RBAC 权限控制、多维实时聚合分析、订单交易与客户 CRM、智能预警引擎、UTF-8 BOM CSV 导出与审计日志。

---

## 核心架构

- **前端 (`apps/web`)**：React 19 · TypeScript · Vite · Tailwind CSS · TanStack Query · TanStack Table · Recharts · Zustand · React Router · Zod · `i18next`（中/EN 双语）· 明暗双主题
- **后端 (`apps/api`)**：Node.js 22 · TypeScript · Fastify 5 · Prisma ORM · SQLite（本地开发） / PostgreSQL（Docker 生产）· JWT · RBAC 中间件 · Swagger OpenAPI (`/api/docs`) · Vitest 集成测试

```text
projects/pulseops-saas/
├── apps/
│   ├── api/                 # Fastify API + Prisma Schema + 确定性 12 个月种子脚本 + Vitest 测试
│   └── web/                 # React 19 SaaS 前端（按路由懒加载 + 独立图表 chunk）
├── docker-compose.yml       # PostgreSQL + Fastify API + Nginx 生产容器编排
├── .env.example             # 环境变量模板
└── package.json             # 根目录 npm workspaces 并行开发/构建/测试脚本
```

---

## 一键本地运行

```bash
# 1. 进入独立项目目录并安装依赖
cd projects/pulseops-saas
npm install

# 2. 初始化 Prisma 客户端、建表并写入确定性 12 个月商业仿真数据
npm run db:generate
npm run db:push
npm run db:seed

# 3. 并行启动前后端开发服务
npm run dev
```

启动后访问：
- **前端应用**：`http://localhost:5173`
- **后端健康检查**：`http://localhost:4000/api/health`
- **Swagger OpenAPI 文档**：`http://localhost:4000/api/docs`

---

## 演示账号与双工作区

登录页内置 **一键免注册进入演示视角** 按钮，也可手动输入以下凭证：

| 账号邮箱 | 密码 | 角色 | 可访问工作区 |
| :--- | :--- | :--- | :--- |
| `owner@pulseops.io` | `PulseOwner2026!` | `OWNER` | 星云零售中国区 (`CNY`) · Nebula Commerce US (`USD`) |
| `admin@pulseops.io` | `PulseAdmin2026!` | `ADMIN` | 星云零售中国区 (`CNY`) · Nebula Commerce US (`USD`) |
| `analyst@pulseops.io` | `PulseView2026!` | `ANALYST` (只读) | 星云零售中国区 (`CNY`) · Nebula Commerce US (`USD`) |

---

## RBAC 权限矩阵（前后端双重校验）

| 能力项 | OWNER | ADMIN | ANALYST |
| :--- | :---: | :---: | :---: |
| 查看增长总览 KPI、多维图表、客户与订单明细 | ✅ | ✅ | ✅ |
| 按当前筛选条件导出 UTF-8 BOM CSV | ✅ | ✅ | ✅ |
| 订单退款 / 开票 / 备注保存 / 注入实时模拟订单 | ✅ | ✅ | ❌ (`403`) |
| 新建企业客户 / 预警规则增删改与 7 日扫描检测 | ✅ | ✅ | ❌ (`403`) |
| 调整团队成员 RBAC 角色 | ✅ | ❌ (`403`) | ❌ (`403`) |

---

## 生产容器化部署（Docker Compose）

```bash
docker compose up --build -d
```

服务启动后通过 Nginx 统一入口访问 `http://localhost:8080`（自动反代 `/api/*` 至 Fastify + PostgreSQL）。

---

## 质量检查与测试命令

```bash
npm run typecheck   # 前后端 TypeScript 严格类型检查
npm run test        # Vitest 后端全量集成测试（多租户隔离 / RBAC / 聚合分析 / CSV / 预警引擎）
npm run build       # 前后端生产打包与 chunk 拆分验证
```
