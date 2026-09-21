// Admin server functions — phase 1: READ ONLY.
//
// Every function is gated by `requireAdmin`, which runs on the server and
// rejects anyone whose `user_roles.role` is not `admin`. The guard is enforced
// here, not in the UI, so hiding a menu item is never the security boundary.
//
// No writes, no secret reads/writes, no provider calls in this phase.

import { createMiddleware, createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type {
  ActivityEvent,
  AdminUser,
  AlertItem,
  CapabilitySummary,
  HealthItem,
  KnowledgeBase,
  Model,
  ModelWithProvider,
  Provider,
  Role,
  UsageEvent,
  Workflow,
} from "@/lib/control-plane";

// --- guard -------------------------------------------------------------------

export const requireAdmin = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const role = (data as { role?: Role } | null)?.role;
    if (role !== "admin") {
      throw new Error("Forbidden: admin role required");
    }
    return next({ context: { ...context, role } });
  });

async function adminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

// --- session -----------------------------------------------------------------

export const getAdminSession = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async ({ context }) => {
    const claims = context.claims as { email?: string } | undefined;
    return {
      userId: context.userId,
      role: context.role as Role,
      email: claims?.email ?? null,
    };
  });

// --- homepage: ① system status ----------------------------------------------

function readCloudflareInfo(): { version: string | null; deployedAt: string | null } {
  const raw = process.env["CF_VERSION_METADATA"];
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { id?: string; tag?: string; timestamp?: string };
      return {
        version: parsed.tag ?? parsed.id ?? null,
        deployedAt: parsed.timestamp ?? null,
      };
    } catch {
      // not JSON — fall through to explicit deploy vars
    }
  }
  return {
    version: process.env["DEPLOY_VERSION"] ?? null,
    deployedAt: process.env["DEPLOY_TIME"] ?? null,
  };
}

export const getSystemStatus = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async (): Promise<HealthItem[]> => {
    const db = await adminClient();

    let supabaseState: HealthItem = {
      key: "supabase",
      label: "Supabase",
      state: "down",
      detail: "连接失败",
    };
    const ping = await db.from("providers").select("id").limit(1);
    if (!ping.error)
      supabaseState = { key: "supabase", label: "Supabase", state: "ok", detail: "正常" };

    const difyConfigured = Boolean(process.env["DIFY_API_KEY"]?.trim());
    const difyState: HealthItem = {
      key: "dify",
      label: "Dify",
      state: difyConfigured ? "ok" : "warn",
      detail: difyConfigured ? "已配置" : "未配置 DIFY_API_KEY",
    };

    const cf = readCloudflareInfo();
    const cfState: HealthItem = {
      key: "cloudflare",
      label: "Cloudflare",
      state: cf.version || cf.deployedAt ? "ok" : "unknown",
      detail:
        cf.version || cf.deployedAt
          ? [
              cf.version ? `版本 ${cf.version}` : null,
              cf.deployedAt ? `部署于 ${cf.deployedAt}` : null,
            ]
              .filter(Boolean)
              .join(" · ")
          : "未接入部署信息",
    };

    const kb = await db.from("knowledge_bases").select("id").eq("enabled", true);
    const kbCount = kb.error ? 0 : ((kb.data ?? []) as unknown[]).length;
    const kbState: HealthItem = {
      key: "knowledge",
      label: "Knowledge",
      state: kb.error ? "down" : kbCount > 0 ? "ok" : "warn",
      detail: kb.error ? "查询失败" : kbCount > 0 ? `${kbCount} 个已启用` : "未配置知识库",
    };

    return [supabaseState, difyState, cfState, kbState];
  });

// --- homepage: ② capabilities -------------------------------------------------

export const getCapabilities = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async (): Promise<CapabilitySummary> => {
    const db = await adminClient();

    const providersRes = await db.from("providers").select("id, secret_ref");
    const providers = (providersRes.data ?? []) as unknown as Pick<Provider, "id" | "secret_ref">[];
    const providersWithSecret = new Set(
      providers.filter((p) => p.secret_ref && p.secret_ref.trim()).map((p) => p.id),
    );

    const modelsRes = await db.from("models").select("id, enabled, provider_id");
    const models = (modelsRes.data ?? []) as unknown as Pick<
      Model,
      "id" | "enabled" | "provider_id"
    >[];

    const workflowsRes = await db.from("workflows").select("id, dify_app_id, secret_ref");
    const workflows = (workflowsRes.data ?? []) as unknown as Pick<
      Workflow,
      "id" | "dify_app_id" | "secret_ref"
    >[];
    const connected = workflows.filter((w) => w.dify_app_id && w.secret_ref).length;

    return {
      models: {
        total: models.length,
        enabled: models.filter((m) => m.enabled).length,
        configured: models.filter((m) => providersWithSecret.has(m.provider_id)).length,
      },
      workflows: {
        total: workflows.length,
        connected,
        pending: workflows.length - connected,
      },
    };
  });

// --- homepage: ③ recent activity ---------------------------------------------

export const listActivity = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async (): Promise<ActivityEvent[]> => {
    const db = await adminClient();
    const { data, error } = await db
      .from("activity_events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as ActivityEvent[];
  });

// --- homepage: ④ alerts (computed from config, not stored) --------------------

export const getAlerts = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async (): Promise<AlertItem[]> => {
    const db = await adminClient();
    const [providersRes, modelsRes, workflowsRes] = await Promise.all([
      db.from("providers").select("id, name, enabled, secret_ref"),
      db.from("models").select("id, display_name, enabled, provider_id"),
      db.from("workflows").select("id, label, enabled, dify_app_id, secret_ref"),
    ]);

    const providers = (providersRes.data ?? []) as unknown as Pick<
      Provider,
      "id" | "name" | "enabled" | "secret_ref"
    >[];
    const models = (modelsRes.data ?? []) as unknown as Pick<
      Model,
      "id" | "display_name" | "enabled" | "provider_id"
    >[];
    const workflows = (workflowsRes.data ?? []) as unknown as Pick<
      Workflow,
      "id" | "label" | "enabled" | "dify_app_id" | "secret_ref"
    >[];

    const providerById = new Map(providers.map((p) => [p.id, p]));
    const alerts: AlertItem[] = [];

    for (const w of workflows) {
      if (w.enabled && (!w.dify_app_id || !w.secret_ref)) {
        alerts.push({
          severity: "warning",
          title: `${w.label} Workflow 配置缺失`,
          detail: !w.dify_app_id ? "缺少 Dify App ID" : "缺少密钥引用",
        });
      }
    }

    for (const p of providers) {
      if (p.enabled && !p.secret_ref?.trim()) {
        alerts.push({
          severity: "warning",
          title: `${p.name} 未配置密钥`,
          detail: "Provider 已启用，但没有 secret_ref",
        });
      }
    }

    for (const m of models) {
      if (!m.enabled) continue;
      const p = providerById.get(m.provider_id);
      if (!p) continue;
      if (!p.enabled || !p.secret_ref?.trim()) {
        alerts.push({
          severity: "warning",
          title: `模型 ${m.display_name} 的 Provider 不可用`,
          detail: `${p.name} 未启用或缺少密钥`,
        });
      }
    }

    return alerts;
  });

// --- providers ---------------------------------------------------------------

export const listProviders = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async (): Promise<Provider[]> => {
    const db = await adminClient();
    const { data, error } = await db
      .from("providers")
      .select("*")
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as Provider[];
  });

export const getProvider = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) => z.object({ providerId: z.string() }).parse(input))
  .handler(async ({ data }): Promise<{ provider: Provider; models: Model[] }> => {
    const db = await adminClient();
    const { data: provider, error } = await db
      .from("providers")
      .select("*")
      .eq("id", data.providerId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!provider) throw new Error("Provider 不存在");
    const modelsRes = await db
      .from("models")
      .select("*")
      .eq("provider_id", data.providerId)
      .order("sort_order", { ascending: true });
    return {
      provider: provider as unknown as Provider,
      models: (modelsRes.data ?? []) as unknown as Model[],
    };
  });

// --- models ------------------------------------------------------------------

export const listModels = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async (): Promise<ModelWithProvider[]> => {
    const db = await adminClient();
    const [modelsRes, providersRes] = await Promise.all([
      db.from("models").select("*").order("sort_order", { ascending: true }),
      db.from("providers").select("id, name, slug, enabled, secret_ref"),
    ]);
    if (modelsRes.error) throw new Error(modelsRes.error.message);
    const providers = (providersRes.data ?? []) as unknown as Pick<
      Provider,
      "id" | "name" | "slug" | "enabled" | "secret_ref"
    >[];
    const byId = new Map(providers.map((p) => [p.id, p]));
    return ((modelsRes.data ?? []) as unknown as Model[]).map((m) => ({
      ...m,
      provider: byId.get(m.provider_id) ?? null,
    }));
  });

export const getModel = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) => z.object({ modelId: z.string() }).parse(input))
  .handler(async ({ data }): Promise<ModelWithProvider> => {
    const db = await adminClient();
    const { data: model, error } = await db
      .from("models")
      .select("*")
      .eq("id", data.modelId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!model) throw new Error("模型不存在");
    const typed = model as unknown as Model;
    const providerRes = await db
      .from("providers")
      .select("id, name, slug, enabled, secret_ref")
      .eq("id", typed.provider_id)
      .maybeSingle();
    return {
      ...typed,
      provider: (providerRes.data as unknown as ModelWithProvider["provider"]) ?? null,
    };
  });

// --- workflows ---------------------------------------------------------------

export const listWorkflows = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async (): Promise<Workflow[]> => {
    const db = await adminClient();
    const { data, error } = await db
      .from("workflows")
      .select("*")
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as Workflow[];
  });

// --- knowledge ---------------------------------------------------------------

export const listKnowledgeBases = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async (): Promise<KnowledgeBase[]> => {
    const db = await adminClient();
    const { data, error } = await db
      .from("knowledge_bases")
      .select("*")
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as KnowledgeBase[];
  });

// --- users -------------------------------------------------------------------

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async (): Promise<AdminUser[]> => {
    const db = await adminClient();
    const { data, error } = await db.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (error) throw new Error(error.message);

    const [rolesRes, quotasRes] = await Promise.all([
      db.from("user_roles").select("user_id, role"),
      db.from("user_quotas").select("user_id, token_used, token_limit, cost_used"),
    ]);
    const roles = (rolesRes.data ?? []) as unknown as { user_id: string; role: Role }[];
    const quotas = (quotasRes.data ?? []) as unknown as {
      user_id: string;
      token_used: number;
      token_limit: number | null;
      cost_used: number;
    }[];
    const roleById = new Map(roles.map((r) => [r.user_id, r.role]));
    const quotaById = new Map(quotas.map((q) => [q.user_id, q]));

    return data.users.map((u) => {
      const q = quotaById.get(u.id);
      return {
        id: u.id,
        email: u.email ?? null,
        role: roleById.get(u.id) ?? "user",
        created_at: u.created_at ?? null,
        last_sign_in_at: u.last_sign_in_at ?? null,
        token_used: q?.token_used ?? 0,
        token_limit: q?.token_limit ?? null,
        cost_used: q?.cost_used ?? 0,
      };
    });
  });

// --- usage -------------------------------------------------------------------

export interface UsageSummary {
  events: number;
  totalTokens: number;
  totalCost: number;
  byCapability: { capability: string; tokens: number; cost: number; events: number }[];
}

export const getUsageSummary = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async (): Promise<UsageSummary> => {
    const db = await adminClient();
    const { data, error } = await db
      .from("usage_events")
      .select("capability, tokens_in, tokens_out, cost");
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as Pick<
      UsageEvent,
      "capability" | "tokens_in" | "tokens_out" | "cost"
    >[];

    const map = new Map<string, { tokens: number; cost: number; events: number }>();
    let totalTokens = 0;
    let totalCost = 0;
    for (const r of rows) {
      const tokens = (r.tokens_in ?? 0) + (r.tokens_out ?? 0);
      const cost = Number(r.cost ?? 0);
      totalTokens += tokens;
      totalCost += cost;
      const cur = map.get(r.capability) ?? { tokens: 0, cost: 0, events: 0 };
      cur.tokens += tokens;
      cur.cost += cost;
      cur.events += 1;
      map.set(r.capability, cur);
    }

    return {
      events: rows.length,
      totalTokens,
      totalCost,
      byCapability: [...map.entries()].map(([capability, v]) => ({ capability, ...v })),
    };
  });
