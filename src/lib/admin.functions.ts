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
  ModelStatus,
  ModelWithProvider,
  Provider,
  QuotaInfo,
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

async function loadOps() {
  return import("@/lib/admin-ops.server");
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
    return ((modelsRes.data ?? []) as unknown as Model[]).map((m) => {
      const provider = byId.get(m.provider_id) ?? null;
      const status: ModelStatus = !m.enabled
        ? "disabled"
        : !provider?.enabled || !provider.secret_ref
          ? "provider_unavailable"
          : "enabled";
      return { ...m, provider, status };
    });
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
    const provider = (providerRes.data as unknown as ModelWithProvider["provider"]) ?? null;
    const status: ModelStatus = !typed.enabled
      ? "disabled"
      : !provider?.enabled || !provider.secret_ref
        ? "provider_unavailable"
        : "enabled";
    return { ...typed, provider, status };
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

// =============================================================================
// Phase 2 — writes, connection tests, quotas
//
// Every mutation re-reads the target server-side, applies only the provided
// fields, records an audit entry in activity_events, and returns a small status
// object. No secret value is ever read into a response or written to the DB.
// =============================================================================

// --- provider write + test ---------------------------------------------------

export const updateProvider = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) =>
    z
      .object({
        providerId: z.string(),
        enabled: z.boolean().optional(),
        secretRef: z.string().max(200).nullable().optional(),
        secretSource: z.enum(["cloudflare_env", "supabase_vault"]).optional(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const db = await adminClient();
    const { data: existing, error: readError } = await db
      .from("providers")
      .select("id")
      .eq("id", data.providerId)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!existing) throw new Error("Provider 不存在");

    const patch: Record<string, unknown> = {};
    if (data.enabled !== undefined) patch["enabled"] = data.enabled;
    if (data.secretRef !== undefined) patch["secret_ref"] = data.secretRef?.trim() || null;
    if (data.secretSource !== undefined) patch["secret_source"] = data.secretSource;

    const ops = await loadOps();
    let result: "ok" | "error" = "ok";
    let detail = "无变更";
    if (Object.keys(patch).length > 0) {
      const { error } = await db.from("providers").update(patch).eq("id", data.providerId);
      if (error) {
        result = "error";
        detail = error.message;
      } else {
        detail = Object.keys(patch).join(", ");
      }
    }
    await ops.recordAdminAction(db, {
      actorUserId: context.userId,
      action: "update_provider",
      targetType: "provider",
      targetId: data.providerId,
      result,
      detail,
    });
    if (result === "error") throw new Error(detail);
    return { ok: true, changed: detail };
  });

export const testProviderConnection = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) => z.object({ providerId: z.string() }).parse(input))
  .handler(async ({ context, data }) => {
    const db = await adminClient();
    const { data: provider, error } = await db
      .from("providers")
      .select("*")
      .eq("id", data.providerId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!provider) throw new Error("Provider 不存在");

    const ops = await loadOps();
    const result = await ops.testProvider(provider as unknown as Provider);
    await ops.recordAdminAction(db, {
      actorUserId: context.userId,
      action: "test_provider_connection",
      targetType: "provider",
      targetId: data.providerId,
      result: result.success ? "ok" : "error",
      detail: result.message,
    });
    return result;
  });

// --- model write -------------------------------------------------------------

export const updateModel = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) =>
    z
      .object({
        modelId: z.string(),
        displayName: z.string().min(1).max(120).optional(),
        modelKey: z.string().min(1).max(60).optional(),
        upstreamId: z.string().min(1).max(160).optional(),
        description: z.string().max(2000).optional(),
        enabled: z.boolean().optional(),
        capabilities: z.array(z.string().max(40)).max(20).optional(),
        slots: z.array(z.string().max(40)).max(20).optional(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const db = await adminClient();
    const { data: existing, error: readError } = await db
      .from("models")
      .select("id")
      .eq("id", data.modelId)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!existing) throw new Error("模型不存在");

    const patch: Record<string, unknown> = {};
    if (data.displayName !== undefined) patch["display_name"] = data.displayName;
    if (data.modelKey !== undefined) patch["model_key"] = data.modelKey;
    if (data.upstreamId !== undefined) patch["upstream_id"] = data.upstreamId;
    if (data.description !== undefined) patch["description"] = data.description;
    if (data.enabled !== undefined) patch["enabled"] = data.enabled;
    if (data.capabilities !== undefined) patch["capabilities"] = data.capabilities;
    if (data.slots !== undefined) patch["slots"] = data.slots;

    const ops = await loadOps();
    let result: "ok" | "error" = "ok";
    let detail = "无变更";
    if (Object.keys(patch).length > 0) {
      const { error } = await db.from("models").update(patch).eq("id", data.modelId);
      if (error) {
        result = "error";
        detail = error.message;
      } else {
        detail = Object.keys(patch).join(", ");
      }
    }
    await ops.recordAdminAction(db, {
      actorUserId: context.userId,
      action: "update_model",
      targetType: "model",
      targetId: data.modelId,
      result,
      detail,
    });
    if (result === "error") throw new Error(detail);
    return { ok: true, changed: detail };
  });

// --- workflow write + test ---------------------------------------------------

export const updateWorkflow = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) =>
    z
      .object({
        workflowId: z.string(),
        label: z.string().min(1).max(80).optional(),
        difyAppId: z.string().max(200).nullable().optional(),
        appType: z.enum(["workflow", "chatflow"]).optional(),
        secretRef: z.string().max(200).nullable().optional(),
        secretSource: z.enum(["cloudflare_env", "supabase_vault"]).optional(),
        enabled: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const db = await adminClient();
    const { data: existing, error: readError } = await db
      .from("workflows")
      .select("id")
      .eq("id", data.workflowId)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!existing) throw new Error("Workflow 不存在");

    const patch: Record<string, unknown> = {};
    if (data.label !== undefined) patch["label"] = data.label;
    if (data.difyAppId !== undefined) patch["dify_app_id"] = data.difyAppId?.trim() || null;
    if (data.appType !== undefined) patch["app_type"] = data.appType;
    if (data.secretRef !== undefined) patch["secret_ref"] = data.secretRef?.trim() || null;
    if (data.secretSource !== undefined) patch["secret_source"] = data.secretSource;
    if (data.enabled !== undefined) patch["enabled"] = data.enabled;

    const ops = await loadOps();
    let result: "ok" | "error" = "ok";
    let detail = "无变更";
    if (Object.keys(patch).length > 0) {
      const { error } = await db.from("workflows").update(patch).eq("id", data.workflowId);
      if (error) {
        result = "error";
        detail = error.message;
      } else {
        detail = Object.keys(patch).join(", ");
      }
    }
    await ops.recordAdminAction(db, {
      actorUserId: context.userId,
      action: "update_workflow",
      targetType: "workflow",
      targetId: data.workflowId,
      result,
      detail,
    });
    if (result === "error") throw new Error(detail);
    return { ok: true, changed: detail };
  });

export const testWorkflowConnection = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) => z.object({ workflowId: z.string() }).parse(input))
  .handler(async ({ context, data }) => {
    const db = await adminClient();
    const { data: workflow, error } = await db
      .from("workflows")
      .select("*")
      .eq("id", data.workflowId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!workflow) throw new Error("Workflow 不存在");

    const ops = await loadOps();
    const result = await ops.testDifyWorkflow(workflow as unknown as Workflow);
    await ops.recordAdminAction(db, {
      actorUserId: context.userId,
      action: "test_workflow_connection",
      targetType: "workflow",
      targetId: data.workflowId,
      result: result.success ? "ok" : "error",
      detail: result.message,
    });
    return result;
  });

// --- user quota --------------------------------------------------------------

function emptyQuota(userId: string): QuotaInfo {
  return {
    user_id: userId,
    period: "monthly",
    token_limit: null,
    token_used: 0,
    cost_limit: null,
    cost_used: 0,
  };
}

export const getUserQuota = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) => z.object({ userId: z.string() }).parse(input))
  .handler(async ({ data }): Promise<QuotaInfo> => {
    const db = await adminClient();
    const { data: row, error } = await db
      .from("user_quotas")
      .select("*")
      .eq("user_id", data.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (row as unknown as QuotaInfo) ?? emptyQuota(data.userId);
  });

export const setUserQuota = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) =>
    z
      .object({
        userId: z.string(),
        tokenLimit: z.number().int().nonnegative().nullable().optional(),
        costLimit: z.number().nonnegative().nullable().optional(),
        period: z.enum(["daily", "weekly", "monthly"]).optional(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }): Promise<QuotaInfo> => {
    const db = await adminClient();
    const { data: userRes, error: userError } = await db.auth.admin.getUserById(data.userId);
    if (userError || !userRes?.user) throw new Error("用户不存在");

    const patch: Record<string, unknown> = { user_id: data.userId };
    if (data.tokenLimit !== undefined) patch["token_limit"] = data.tokenLimit;
    if (data.costLimit !== undefined) patch["cost_limit"] = data.costLimit;
    if (data.period !== undefined) patch["period"] = data.period;

    const ops = await loadOps();
    const { data: row, error } = await db
      .from("user_quotas")
      .upsert(patch, { onConflict: "user_id" })
      .select("*")
      .single();
    const result: "ok" | "error" = error ? "error" : "ok";
    await ops.recordAdminAction(db, {
      actorUserId: context.userId,
      action: "set_user_quota",
      targetType: "user",
      targetId: data.userId,
      result,
      detail:
        result === "ok"
          ? Object.keys(patch)
              .filter((k) => k !== "user_id")
              .join(", ")
          : error?.message,
    });
    if (error) throw new Error(error.message);
    return row as unknown as QuotaInfo;
  });
