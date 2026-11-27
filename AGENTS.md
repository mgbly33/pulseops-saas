# PulseOps — Project Constitution & Engineering Rules

You are developing the enterprise commercial growth & revenue operations SaaS platform **PulseOps — Commercial Growth & Revenue Operations Platform**.

## 1. Strict Project Directory Isolation
- All source code, dependencies (`node_modules`), database files, environment variables, tests, and deployment scripts MUST remain 100% inside `projects/pulseops-saas/`.
- Never create files in the parent workspace directory or touch sibling project folders.

## 2. Architecture & Stack
- **Frontend (`apps/web`)**: React 19 + TypeScript + Vite + Tailwind CSS + TanStack Query + TanStack Table + Recharts + Zustand + React Router + Zod + `i18next` (ZH / EN) + Light/Dark themes.
- **Backend (`apps/api`)**: Node.js 22 + TypeScript + Fastify + Prisma ORM + SQLite (100% PostgreSQL-compatible schema) + Zod + JWT + RBAC + CSV UTF-8 BOM streaming export + Swagger OpenAPI (`/api/docs`).

## 3. Security, Multi-Tenancy & RBAC
- Every business endpoint MUST validate authenticated user membership for `X-Workspace-Id` and enforce RBAC (`OWNER` > `ADMIN` > `ANALYST`).
- `ANALYST` is strictly read-only: any mutating request MUST return `403 FORBIDDEN`.
- All critical write operations automatically record an `AuditLog` entry.

## 4. Data Integrity & UX Craft
- Zero hardcoded mock data in the frontend: all KPIs, charts, tables, alerts, and exports are computed and served by the backend API.
- All currency values, percentages, table cells, and chart ticks MUST use `tabular-nums`.
- Full ZH / EN localization and Light / Dark mode support with Stripe / Linear-grade restraint and precision.
