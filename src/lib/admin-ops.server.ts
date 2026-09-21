// Server-only helpers for the Admin control plane.
//
// This module touches process.env and resolves secrets, so it must never be
// imported by client code. Server functions load it with a dynamic import
// inside their handlers.
//
// Secret rules enforced here:
//   - a secret VALUE is only ever held in a local variable, never returned,
//     never logged, never inserted into the database;
//   - the database stores only `secret_ref` (a name) and `secret_source`;
//   - error text is sanitized before it leaves this module.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type SecretResolution = { ok: true; value: string } | { ok: false; reason: string };

/**
 * Resolve a `secret_ref` to its value server-side.
 *
 * `cloudflare_env` reads a Worker binding / process env var by name.
 * `supabase_vault` is intentionally NOT connected yet — it returns a clear
 * "not connected" reason instead of faking success.
 */
export function resolveSecret(
  secretRef: string | null | undefined,
  secretSource: string,
): SecretResolution {
  const ref = secretRef?.trim();
  if (!ref) return { ok: false, reason: "未配置 Secret" };

  if (secretSource === "supabase_vault") {
    // TODO(phase 3): read from Supabase Vault via service_role rpc.
    return { ok: false, reason: "Supabase Vault 尚未连接（TODO）" };
  }

  const value = process.env[ref]?.trim();
  if (!value) return { ok: false, reason: `Cloudflare 绑定 ${ref} 不存在` };
  return { ok: true, value };
}

/** Strip anything that looks like the secret from an outgoing message. */
export function sanitizeSecretText(text: string, secrets: (string | null | undefined)[]): string {
  let out = text;
  for (const s of secrets) {
    if (s && s.length >= 6) out = out.split(s).join("***");
  }
  out = out.replace(/Bearer\s+\S+/gi, "Bearer ***");
  out = out.replace(/\b(sk|app|key)-[A-Za-z0-9._-]{6,}/gi, "$1-***");
  return out.slice(0, 300);
}

export interface ConnectionResult {
  success: boolean;
  latencyMs: number | null;
  message: string;
}

const DIFY_DEFAULT_BASE = "https://api.dify.ai/v1";

function difyBaseUrl(): string {
  return (process.env["DIFY_API_BASE"] ?? process.env["DIFY_API_URL"] ?? DIFY_DEFAULT_BASE).replace(
    /\/+$/,
    "",
  );
}

function defaultBase(kind: string): string {
  switch (kind) {
    case "openai":
      return "https://api.openai.com/v1";
    case "anthropic":
      return "https://api.anthropic.com";
    case "google":
      return "https://generativelanguage.googleapis.com";
    case "deepseek":
      return "https://api.deepseek.com/v1";
    case "dify":
      return difyBaseUrl();
    default:
      return "";
  }
}

async function timedFetch(
  url: string,
  headers: Record<string, string>,
  secrets: string[],
): Promise<ConnectionResult> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { headers, signal: controller.signal });
    clearTimeout(timer);
    const latencyMs = Date.now() - start;
    if (res.ok) return { success: true, latencyMs, message: `连接成功（HTTP ${res.status}）` };
    const detail = await res.text().catch(() => "");
    return {
      success: false,
      latencyMs,
      message: sanitizeSecretText(`HTTP ${res.status} ${detail}`, secrets),
    };
  } catch (err) {
    return {
      success: false,
      latencyMs: Date.now() - start,
      message: sanitizeSecretText((err as Error).message || "请求失败", secrets),
    };
  }
}

export async function testProvider(provider: {
  kind: string;
  base_url: string | null;
  secret_ref: string | null;
  secret_source: string;
}): Promise<ConnectionResult> {
  const resolved = resolveSecret(provider.secret_ref, provider.secret_source);
  if (!resolved.ok) return { success: false, latencyMs: null, message: resolved.reason };

  const base = (provider.base_url?.trim() || defaultBase(provider.kind)).replace(/\/+$/, "");
  if (!base) return { success: false, latencyMs: null, message: "未配置 Base URL" };

  const key = resolved.value;
  let url = `${base}/models`;
  const headers: Record<string, string> = {};

  switch (provider.kind) {
    case "anthropic":
      url = `${base}/v1/models`;
      headers["x-api-key"] = key;
      headers["anthropic-version"] = "2023-06-01";
      break;
    case "google":
      url = `${base}/v1beta/models?key=${encodeURIComponent(key)}`;
      break;
    default:
      headers["Authorization"] = `Bearer ${key}`;
  }

  return timedFetch(url, headers, [key]);
}

export async function testDifyWorkflow(workflow: {
  dify_app_id: string | null;
  secret_ref: string | null;
  secret_source: string;
}): Promise<ConnectionResult> {
  if (!workflow.dify_app_id?.trim()) {
    return { success: false, latencyMs: null, message: "未配置 Dify App ID" };
  }
  const resolved = resolveSecret(workflow.secret_ref, workflow.secret_source);
  if (!resolved.ok) return { success: false, latencyMs: null, message: resolved.reason };

  const key = resolved.value;
  const url = `${difyBaseUrl()}/parameters`;
  return timedFetch(url, { Authorization: `Bearer ${key}` }, [key]);
}

// --- audit log ---------------------------------------------------------------

export interface AuditEntry {
  actorUserId: string;
  action: string;
  targetType: string;
  targetId: string;
  result: "ok" | "error";
  detail?: string | undefined;
}

/**
 * Append an admin action to activity_events (reused as the audit log).
 * Never pass secret values in `detail` — only names/ids/statuses.
 * Failures are swallowed: auditing must not break the operation.
 */
export async function recordAdminAction(
  db: SupabaseClient<Database>,
  entry: AuditEntry,
): Promise<void> {
  try {
    await db.from("activity_events").insert({
      type: "admin_action",
      title: `${entry.action} · ${entry.targetType}`,
      actor_user_id: entry.actorUserId,
      metadata: {
        action: entry.action,
        target_type: entry.targetType,
        target_id: entry.targetId,
        result: entry.result,
        detail: entry.detail ?? null,
      },
    });
  } catch {
    // ignored on purpose
  }
}
