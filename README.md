# AI Studio Admin

AI Studio 的控制台（控制面）。与 Project Navigator 共用同一个 Supabase 项目。

## 阶段

- **第一阶段（当前）**：只读骨架 + 数据读取。首页四问、Providers / Models / Workflows / Knowledge / 用户 / 用量 均为只读。
- 尚未实现：写操作、密钥写入、模型切换、真实 Dify 调度、测试连接。

## 技术栈

TanStack Start · React · TypeScript · Supabase · Tailwind CSS · shadcn/ui

## 鉴权

- 复用 Project Navigator 的 Supabase Auth（邮箱 + 密码）。
- 管理员判定：`public.user_roles.role = 'admin'`。
- **服务端鉴权**：`/_admin/*` 由 `beforeLoad` 调用服务端函数 `getAdminSession`（内含 `requireAdmin` 中间件）校验；所有 Admin 数据接口都经过同一中间件，隐藏菜单不是安全边界。
- 角色列可扩展 `operator / editor / user`。

## 数据

- 控制面表（`providers / models / workflows / knowledge_bases / user_roles / usage_events / user_quotas / activity_events`）的迁移在 **Project Navigator 仓库** `supabase/migrations/`，本仓库不重复建表。
- 密钥只存 `secret_ref` + `secret_source`（`cloudflare_env` | `supabase_vault`），真实值不落库。

## 开发

```sh
npm install
npm run dev
```

## 部署（Cloudflare Workers）

```sh
npx wrangler login
npm run cf:deploy
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_PUBLISHABLE_KEY
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```
