// Admin server functions, aligned with the authoritative ai_* control plane.
//
// Every function is gated by `requireAdmin` (server-side, user_roles.role).
// No quota (user_quotas has no confirmed fields), no activity_events.
// Run/usage data comes from usage_events.

import { createMiddleware, createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type {
  AdminUser,
  AlertItem,
  CapabilitySummary,
  HealthItem,
  Model,
  ModelStatus,
  ModelWithProvider,
  Provider,
  Role,
  Skill,
  UsageEvent,
  UsageSummary,
  Workflow,
  WorkflowWithProvider,
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
    if (role !== "admin") throw new Error("Forbidden: admin role required");
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

// --- helpers -----------------------------------------------------------------

type ProviderLite = Pick<Provider, "id" | "key" | "name" | "base_url" | "enabled" | "secret_ref">;

function hasSecret(p: { secret_ref: string | null } | null | undefined): boolean {
  return Boolean(p?.secret_ref && p.secret_ref.trim());
}

function workflowConnected(w: Workflow, provider: ProviderLite | null): boolean {
  if (!w.enabled) return false;
  if (!provider || !provider.enabled || !provider.base_url?.trim()) return false;
  return Boolean((w.secret_ref && w.secret_ref.trim()) || hasSecret(provider));
}

// --- homepage: ① system status ----------------------------------------------

function readCloudflareInfo(): { version: string | null; deployedAt: string | null } {
  const raw = process.env["CF_VERSION_METADATA"];
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { id?: string; tag?: string; timestamp?: string };
      return { version: parsed.tag ?? parsed.id ?? null, deployedAt: parsed.timestamp ?? null };
    } catch {
      // fall through
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
    const ping = await db.from("ai_providers").select("id").limit(1);
    if (!ping.error)
      supabaseState = { key: "supabase", label: "Supabase", state: "ok", detail: "正常" };

    // Dify = at least one enabled workflow whose provider is usable.
    const [wfRes, pvRes] = await Promise.all([
      db.from("ai_workflows").select("id, enabled, secret_ref, provider_key"),
      db.from("ai_providers").select("id, key, name, base_url, enabled, secret_ref"),
    ]);
    const providers = (pvRes.data ?? []) as unknown as ProviderLite[];
    const providerByKey = new Map(providers.map((p) => [p.key, p]));
    const workflows = (wfRes.data ?? []) as unknown as Pick<
      Workflow,
      "id" | "enabled" | "secret_ref" | "provider_key"
    >[];
    const ready = workflows.filter((w) => {
      const p = w.provider_key ? providerByKey.get(w.provider_key) : null;
      return workflowConnected(w as unknown as Workflow, p ?? null);
    }).length;
    const difyState: HealthItem = {
      key: "dify",
      label: "Dify",
      state: wfRes.error ? "down" : ready > 0 ? "ok" : "warn",
      detail: wfRes.error
        ? "查询失败"
        : ready > 0
          ? `${ready} 个工作流已配置`
          : "暂无可用的工作流配置",
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

    return [supabaseState, difyState, cfState];
  });

// --- homepage: ② capabilities -------------------------------------------------

export const getCapabilities = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async (): Promise<CapabilitySummary> => {
    const db = await adminClient();
    const [pvRes, mdRes, wfRes] = await Promise.all([
      db.from("ai_providers").select("id, key, name, base_url, enabled, secret_ref"),
      db.from("ai_models").select("id, enabled, provider_key"),
      db.from("ai_workflows").select("id, enabled, secret_ref, provider_key"),
    ]);

    const providers = (pvRes.data ?? []) as unknown as ProviderLite[];
    const providerByKey = new Map(providers.map((p) => [p.key, p]));
    const providersWithSecret = new Set(providers.filter(hasSecret).map((p) => p.key));

    const models = (mdRes.data ?? []) as unknown as Pick<
      Model,
      "id" | "enabled" | "provider_key"
    >[];
    const workflows = (wfRes.data ?? []) as unknown as Pick<
      Workflow,
      "id" | "enabled" | "secret_ref" | "provider_key"
    >[];
    const connected = workflows.filter((w) => {
      const p = w.provider_key ? providerByKey.get(w.provider_key) : null;
      return workflowConnected(w as unknown as Workflow, p ?? null);
    }).length;

    return {
      providers: { total: providers.length, enabled: providers.filter((p) => p.enabled).length },
      models: {
        total: models.length,
        enabled: models.filter((m) => m.enabled).length,
        configured: models.filter((m) => m.provider_key && providersWithSecret.has(m.provider_key))
          .length,
      },
      workflows: { total: workflows.length, connected, pending: workflows.length - connected },
    };
  });

// --- homepage: ③ recent runs (usage_events) ----------------------------------

export const listRecentRuns = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async (): Promise<UsageEvent[]> => {
    const db = await adminClient();
    const { data, error } = await db
      .from("usage_events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as UsageEvent[];
  });

// --- homepage: ④ alerts (computed from ai_* config) ---------------------------

export const getAlerts = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async (): Promise<AlertItem[]> => {
    const db = await adminClient();
    const [pvRes, mdRes, wfRes] = await Promise.all([
      db.from("ai_providers").select("id, key, name, base_url, enabled, secret_ref"),
      db.from("ai_models").select("id, name, enabled, provider_key"),
      db.from("ai_workflows").select("id, key, name, enabled, secret_ref, provider_key"),
    ]);

    const providers = (pvRes.data ?? []) as unknown as ProviderLite[];
    const providerByKey = new Map(providers.map((p) => [p.key, p]));
    const models = (mdRes.data ?? []) as unknown as Pick<
      Model,
      "id" | "name" | "enabled" | "provider_key"
    >[];
    const workflows = (wfRes.data ?? []) as unknown as Pick<
      Workflow,
      "id" | "key" | "name" | "enabled" | "secret_ref" | "provider_key"
    >[];

    const alerts: AlertItem[] = [];

    for (const p of providers) {
      if (p.enabled && !p.base_url?.trim()) {
        alerts.push({
          severity: "warning",
          title: `${p.name} 未配置 base_url`,
          detail: "Provider 已启用，但没有连接地址",
        });
      }
    }

    for (const w of workflows) {
      if (!w.enabled) continue;
      const p = w.provider_key ? providerByKey.get(w.provider_key) : null;
      if (!w.provider_key || !p) {
        alerts.push({
          severity: "warning",
          title: `${w.name} 未关联 Provider`,
          detail: "工作流已启用，但 provider_key 为空或找不到对应 Provider",
        });
        continue;
      }
      if (!p.enabled) {
        alerts.push({
          severity: "warning",
          title: `${w.name} 的 Provider 已停用`,
          detail: p.name,
        });
        continue;
      }
      if (!p.base_url?.trim()) {
        alerts.push({
          severity: "warning",
          title: `${w.name} 的 Provider 未配置地址`,
          detail: p.name,
        });
      }
      if (!(w.secret_ref?.trim() || p.secret_ref?.trim())) {
        alerts.push({
          severity: "warning",
          title: `${w.name} 未配置密钥`,
          detail: "workflow 与 provider 的 secret_ref 均为空",
        });
      }
    }

    for (const m of models) {
      if (!m.enabled) continue;
      const p = m.provider_key ? providerByKey.get(m.provider_key) : null;
      if (!p || !p.enabled || !hasSecret(p)) {
        alerts.push({
          severity: "warning",
          title: `模型 ${m.name} 的 Provider 不可用`,
          detail: !p ? "未关联 Provider" : "Provider 未启用或缺少 secret_ref",
        });
      }
    }

    return alerts;
  });

// --- providers ---------------------------------------------------------------

const PROVIDER_COLUMNS =
  "id, key, name, description, base_url, secret_ref, enabled, created_at, updated_at";

export const listProviders = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async (): Promise<Provider[]> => {
    const db = await adminClient();
    const { data, error } = await db
      .from("ai_providers")
      .select(PROVIDER_COLUMNS)
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as Provider[];
  });

export const getProvider = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) => z.object({ providerId: z.string() }).parse(input))
  .handler(
    async ({ data }): Promise<{ provider: Provider; models: Model[]; workflows: Workflow[] }> => {
      const db = await adminClient();
      const { data: provider, error } = await db
        .from("ai_providers")
        .select(PROVIDER_COLUMNS)
        .eq("id", data.providerId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!provider) throw new Error("Provider 不存在");
      const typed = provider as unknown as Provider;

      const [modelsRes, workflowsRes] = await Promise.all([
        db
          .from("ai_models")
          .select("*")
          .eq("provider_key", typed.key)
          .order("sort_order", { ascending: true }),
        db
          .from("ai_workflows")
          .select("*")
          .eq("provider_key", typed.key)
          .order("sort_order", { ascending: true }),
      ]);

      return {
        provider: typed,
        models: (modelsRes.data ?? []) as unknown as Model[],
        workflows: (workflowsRes.data ?? []) as unknown as Workflow[],
      };
    },
  );

// --- models ------------------------------------------------------------------

export const listModels = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async (): Promise<ModelWithProvider[]> => {
    const db = await adminClient();
    const [modelsRes, providersRes] = await Promise.all([
      db.from("ai_models").select("*").order("sort_order", { ascending: true }),
      db.from("ai_providers").select("id, key, name, base_url, enabled, secret_ref"),
    ]);
    if (modelsRes.error) throw new Error(modelsRes.error.message);
    const providers = (providersRes.data ?? []) as unknown as ProviderLite[];
    const byKey = new Map(providers.map((p) => [p.key, p]));

    return ((modelsRes.data ?? []) as unknown as Model[]).map((m) => {
      const p = m.provider_key ? byKey.get(m.provider_key) : null;
      const status: ModelStatus = !m.enabled
        ? "disabled"
        : !p || !p.enabled || !hasSecret(p)
          ? "provider_unavailable"
          : "enabled";
      return {
        ...m,
        provider: p
          ? { id: p.id, key: p.key, name: p.name, enabled: p.enabled, secret_ref: p.secret_ref }
          : null,
        status,
      };
    });
  });

export const getModel = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) => z.object({ modelId: z.string() }).parse(input))
  .handler(async ({ data }): Promise<ModelWithProvider> => {
    const db = await adminClient();
    const { data: model, error } = await db
      .from("ai_models")
      .select("*")
      .eq("id", data.modelId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!model) throw new Error("模型不存在");
    const typed = model as unknown as Model;

    let provider: ModelWithProvider["provider"] = null;
    if (typed.provider_key) {
      const pvRes = await db
        .from("ai_providers")
        .select("id, key, name, base_url, enabled, secret_ref")
        .eq("key", typed.provider_key)
        .maybeSingle();
      const p = pvRes.data as unknown as ProviderLite | null;
      if (p) {
        provider = {
          id: p.id,
          key: p.key,
          name: p.name,
          enabled: p.enabled,
          secret_ref: p.secret_ref,
        };
      }
    }

    const status: ModelStatus = !typed.enabled
      ? "disabled"
      : !provider || !provider.enabled || !hasSecret(provider)
        ? "provider_unavailable"
        : "enabled";
    return { ...typed, provider, status };
  });

// --- workflows ---------------------------------------------------------------

export const listWorkflows = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async (): Promise<WorkflowWithProvider[]> => {
    const db = await adminClient();
    const [wfRes, pvRes] = await Promise.all([
      db.from("ai_workflows").select("*").order("sort_order", { ascending: true }),
      db.from("ai_providers").select("id, key, name, base_url, enabled, secret_ref"),
    ]);
    if (wfRes.error) throw new Error(wfRes.error.message);
    const providers = (pvRes.data ?? []) as unknown as ProviderLite[];
    const byKey = new Map(providers.map((p) => [p.key, p]));

    return ((wfRes.data ?? []) as unknown as Workflow[]).map((w) => {
      const p = w.provider_key ? byKey.get(w.provider_key) : null;
      return {
        ...w,
        provider: p
          ? {
              id: p.id,
              key: p.key,
              name: p.name,
              base_url: p.base_url,
              enabled: p.enabled,
              secret_ref: p.secret_ref,
            }
          : null,
        connected: workflowConnected(w, p ?? null),
      };
    });
  });

// --- users -------------------------------------------------------------------

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async (): Promise<AdminUser[]> => {
    const db = await adminClient();
    const { data, error } = await db.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (error) throw new Error(error.message);
    const rolesRes = await db.from("user_roles").select("user_id, role");
    const roles = (rolesRes.data ?? []) as unknown as { user_id: string; role: Role }[];
    const roleById = new Map(roles.map((r) => [r.user_id, r.role]));

    return data.users.map((u) => ({
      id: u.id,
      email: u.email ?? null,
      role: roleById.get(u.id) ?? "user",
      created_at: u.created_at ?? null,
      last_sign_in_at: u.last_sign_in_at ?? null,
    }));
  });

// --- usage -------------------------------------------------------------------

export const getUsageSummary = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async (): Promise<UsageSummary> => {
    const db = await adminClient();
    const { data, error } = await db
      .from("usage_events")
      .select("workflow_key, input_tokens, output_tokens");
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as Pick<
      UsageEvent,
      "workflow_key" | "input_tokens" | "output_tokens"
    >[];

    const map = new Map<string, { input: number; output: number; events: number }>();
    let totalInput = 0;
    let totalOutput = 0;
    for (const r of rows) {
      const input = r.input_tokens ?? 0;
      const output = r.output_tokens ?? 0;
      totalInput += input;
      totalOutput += output;
      const key = r.workflow_key ?? "(未标记)";
      const cur = map.get(key) ?? { input: 0, output: 0, events: 0 };
      cur.input += input;
      cur.output += output;
      cur.events += 1;
      map.set(key, cur);
    }

    return {
      events: rows.length,
      totalInput,
      totalOutput,
      byWorkflow: [...map.entries()].map(([workflowKey, v]) => ({ workflowKey, ...v })),
    };
  });

// =============================================================================
// Writes + connection tests
//
// Every mutation re-reads the target server-side, applies only the provided
// fields, and returns a small status object. No secret value is read into a
// response or written to the database. No audit table exists.
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
        description: z.string().max(2000).optional(),
        key: z.string().min(1).max(80).optional(),
        name: z.string().min(1).max(120).optional(),
        baseUrl: z.string().max(500).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const db = await adminClient();
    const { data: existing, error: readError } = await db
      .from("ai_providers")
      .select("id")
      .eq("id", data.providerId)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!existing) throw new Error("Provider 不存在");

    const patch: Record<string, unknown> = {};
    if (data.enabled !== undefined) patch["enabled"] = data.enabled;
    if (data.secretRef !== undefined) patch["secret_ref"] = data.secretRef?.trim() || null;
    if (data.description !== undefined) patch["description"] = data.description;
    if (data.key !== undefined) patch["key"] = data.key;
    if (data.name !== undefined) patch["name"] = data.name;
    if (data.baseUrl !== undefined) patch["base_url"] = data.baseUrl?.trim() || null;

    if (Object.keys(patch).length > 0) {
      const { error } = await db.from("ai_providers").update(patch).eq("id", data.providerId);
      if (error) throw new Error(error.message);
    }
    return { ok: true, changed: Object.keys(patch).join(", ") || "无变更" };
  });

export const testProviderConnection = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) => z.object({ providerId: z.string() }).parse(input))
  .handler(async ({ data }) => {
    const db = await adminClient();
    const { data: provider, error } = await db
      .from("ai_providers")
      .select("id, base_url, secret_ref")
      .eq("id", data.providerId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!provider) throw new Error("Provider 不存在");

    const ops = await import("@/lib/admin-ops.server");
    return ops.testProvider(
      provider as unknown as { base_url: string | null; secret_ref: string | null },
    );
  });

// --- model write -------------------------------------------------------------

export const updateModel = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) =>
    z
      .object({
        modelId: z.string(),
        enabled: z.boolean().optional(),
        key: z.string().min(1).max(80).optional(),
        name: z.string().min(1).max(120).optional(),
        description: z.string().max(2000).optional(),
        capabilities: z.array(z.string().max(40)).max(20).optional(),
        providerKey: z.string().max(80).nullable().optional(),
        sortOrder: z.number().int().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const db = await adminClient();
    const { data: existing, error: readError } = await db
      .from("ai_models")
      .select("id")
      .eq("id", data.modelId)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!existing) throw new Error("模型不存在");

    const patch: Record<string, unknown> = {};
    if (data.enabled !== undefined) patch["enabled"] = data.enabled;
    if (data.key !== undefined) patch["key"] = data.key;
    if (data.name !== undefined) patch["name"] = data.name;
    if (data.description !== undefined) patch["description"] = data.description;
    if (data.capabilities !== undefined) patch["capabilities"] = data.capabilities;
    if (data.providerKey !== undefined) patch["provider_key"] = data.providerKey?.trim() || null;
    if (data.sortOrder !== undefined) patch["sort_order"] = data.sortOrder;

    if (Object.keys(patch).length > 0) {
      const { error } = await db.from("ai_models").update(patch).eq("id", data.modelId);
      if (error) throw new Error(error.message);
    }
    return { ok: true, changed: Object.keys(patch).join(", ") || "无变更" };
  });

// --- workflow write + test ---------------------------------------------------

export const updateWorkflow = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) =>
    z
      .object({
        workflowId: z.string(),
        enabled: z.boolean().optional(),
        key: z.string().min(1).max(80).optional(),
        name: z.string().min(1).max(120).optional(),
        description: z.string().max(2000).optional(),
        secretRef: z.string().max(200).nullable().optional(),
        providerKey: z.string().max(80).nullable().optional(),
        sortOrder: z.number().int().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const db = await adminClient();
    const { data: existing, error: readError } = await db
      .from("ai_workflows")
      .select("id")
      .eq("id", data.workflowId)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!existing) throw new Error("Workflow 不存在");

    const patch: Record<string, unknown> = {};
    if (data.enabled !== undefined) patch["enabled"] = data.enabled;
    if (data.key !== undefined) patch["key"] = data.key;
    if (data.name !== undefined) patch["name"] = data.name;
    if (data.description !== undefined) patch["description"] = data.description;
    if (data.secretRef !== undefined) patch["secret_ref"] = data.secretRef?.trim() || null;
    if (data.providerKey !== undefined) patch["provider_key"] = data.providerKey?.trim() || null;
    if (data.sortOrder !== undefined) patch["sort_order"] = data.sortOrder;

    if (Object.keys(patch).length > 0) {
      const { error } = await db.from("ai_workflows").update(patch).eq("id", data.workflowId);
      if (error) throw new Error(error.message);
    }
    return { ok: true, changed: Object.keys(patch).join(", ") || "无变更" };
  });

export const testWorkflowConnection = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) => z.object({ workflowId: z.string() }).parse(input))
  .handler(async ({ data }) => {
    const db = await adminClient();
    const { data: workflow, error } = await db
      .from("ai_workflows")
      .select("id, secret_ref, provider_key")
      .eq("id", data.workflowId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!workflow) throw new Error("Workflow 不存在");

    const row = workflow as unknown as { secret_ref: string | null; provider_key: string | null };
    let provider: { base_url: string | null; secret_ref: string | null } | null = null;
    if (row.provider_key) {
      const pvRes = await db
        .from("ai_providers")
        .select("base_url, secret_ref")
        .eq("key", row.provider_key)
        .maybeSingle();
      provider =
        (pvRes.data as unknown as { base_url: string | null; secret_ref: string | null }) ?? null;
    }

    const ops = await import("@/lib/admin-ops.server");
    return ops.testDifyWorkflow({ secret_ref: row.secret_ref }, provider);
  });

// =============================================================================
// Skills (ai_skills) — Direct Model path only. Admin-managed catalog.
// =============================================================================

export const listSkills = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async (): Promise<Skill[]> => {
    const db = await adminClient();
    const { data, error } = await db
      .from("ai_skills")
      .select("*")
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as Skill[];
  });

export const createSkill = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) =>
    z
      .object({
        key: z.string().min(1).max(80),
        name: z.string().min(1).max(120),
        description: z.string().max(2000).optional(),
        instructions: z.string().max(20000).optional(),
        version: z.string().max(40).optional(),
        enabled: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<Skill> => {
    const db = await adminClient();
    const { data: row, error } = await db
      .from("ai_skills")
      .insert({
        key: data.key.trim(),
        name: data.name.trim(),
        description: data.description ?? "",
        instructions: data.instructions ?? "",
        version: data.version ?? "1.0.0",
        enabled: data.enabled ?? false,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row as unknown as Skill;
  });

export const updateSkill = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) =>
    z
      .object({
        skillId: z.string(),
        key: z.string().min(1).max(80).optional(),
        name: z.string().min(1).max(120).optional(),
        description: z.string().max(2000).optional(),
        instructions: z.string().max(20000).optional(),
        version: z.string().max(40).optional(),
        enabled: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const db = await adminClient();
    const { data: existing, error: readError } = await db
      .from("ai_skills")
      .select("id")
      .eq("id", data.skillId)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!existing) throw new Error("Skill 不存在");

    const patch: Record<string, unknown> = {};
    if (data.key !== undefined) patch["key"] = data.key.trim();
    if (data.name !== undefined) patch["name"] = data.name.trim();
    if (data.description !== undefined) patch["description"] = data.description;
    if (data.instructions !== undefined) patch["instructions"] = data.instructions;
    if (data.version !== undefined) patch["version"] = data.version.trim();
    if (data.enabled !== undefined) patch["enabled"] = data.enabled;

    if (Object.keys(patch).length > 0) {
      const { error } = await db.from("ai_skills").update(patch).eq("id", data.skillId);
      if (error) throw new Error(error.message);
    }
    return { ok: true, changed: Object.keys(patch).join(", ") || "无变更" };
  });

export const deleteSkill = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) => z.object({ skillId: z.string() }).parse(input))
  .handler(async ({ data }) => {
    const db = await adminClient();
    const { error } = await db.from("ai_skills").delete().eq("id", data.skillId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// =============================================================================
// Provider / Model create + delete (Direct Model API onboarding)
// =============================================================================

export const createProvider = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) =>
    z
      .object({
        key: z.string().min(1).max(80),
        name: z.string().min(1).max(120),
        description: z.string().max(2000).optional(),
        baseUrl: z.string().max(500).nullable().optional(),
        secretRef: z.string().max(200).nullable().optional(),
        enabled: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<Provider> => {
    const db = await adminClient();
    const { data: row, error } = await db
      .from("ai_providers")
      .insert({
        key: data.key.trim(),
        name: data.name.trim(),
        description: data.description ?? "",
        base_url: data.baseUrl?.trim() || null,
        secret_ref: data.secretRef?.trim() || null,
        enabled: data.enabled ?? false,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row as unknown as Provider;
  });

export const deleteProvider = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) => z.object({ providerId: z.string() }).parse(input))
  .handler(async ({ data }) => {
    const db = await adminClient();
    const { data: existing, error: readError } = await db
      .from("ai_providers")
      .select("id, key")
      .eq("id", data.providerId)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!existing) throw new Error("Provider 不存在");

    const key = (existing as { key: string }).key;
    const [modelsRes, workflowsRes] = await Promise.all([
      db.from("ai_models").select("id").eq("provider_key", key),
      db.from("ai_workflows").select("id").eq("provider_key", key),
    ]);
    const mc = (modelsRes.data ?? []).length;
    const wc = (workflowsRes.data ?? []).length;
    if (mc > 0 || wc > 0) {
      throw new Error(`仍有 ${mc} 个模型 / ${wc} 个工作流引用该 Provider，请先处理`);
    }

    const { error } = await db.from("ai_providers").delete().eq("id", data.providerId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const createModel = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) =>
    z
      .object({
        key: z.string().min(1).max(120),
        name: z.string().min(1).max(120),
        description: z.string().max(2000).optional(),
        capabilities: z.array(z.string().max(40)).max(20).optional(),
        providerKey: z.string().max(80).nullable().optional(),
        enabled: z.boolean().optional(),
        sortOrder: z.number().int().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<Model> => {
    const db = await adminClient();
    if (data.providerKey) {
      const { data: provider } = await db
        .from("ai_providers")
        .select("id")
        .eq("key", data.providerKey)
        .maybeSingle();
      if (!provider) throw new Error("指定的 Provider 不存在");
    }
    const { data: row, error } = await db
      .from("ai_models")
      .insert({
        key: data.key.trim(),
        name: data.name.trim(),
        description: data.description ?? "",
        capabilities: data.capabilities ?? [],
        provider_key: data.providerKey || null,
        enabled: data.enabled ?? false,
        sort_order: data.sortOrder ?? 0,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row as unknown as Model;
  });

export const deleteModel = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) => z.object({ modelId: z.string() }).parse(input))
  .handler(async ({ data }) => {
    const db = await adminClient();
    const { error } = await db.from("ai_models").delete().eq("id", data.modelId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
