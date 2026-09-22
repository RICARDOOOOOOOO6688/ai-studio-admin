// Server-only helpers for the Admin control plane (ai_* schema).
//
// Secret rules: a value is only ever held in a local variable; it is never
// returned, logged, or inserted into the database. The control plane has no
// `secret_source` column, so a `secret_ref` is always an env binding name.
//
// There is no audit table (activity_events does not exist), so no admin-action
// audit is recorded — this is intentional, not a silent omission.

export type SecretResolution = { ok: true; value: string } | { ok: false; reason: string };

export function resolveSecret(secretRef: string | null | undefined): SecretResolution {
  const ref = secretRef?.trim();
  if (!ref) return { ok: false, reason: "未配置 secret_ref" };
  const value = process.env[ref]?.trim();
  if (!value) return { ok: false, reason: `环境绑定 ${ref} 不存在` };
  return { ok: true, value };
}

/** Strip anything that looks like a secret before a message leaves the server. */
export function sanitizeSecretText(text: string, secrets: (string | null | undefined)[]): string {
  let out = text;
  for (const s of secrets) {
    if (s && s.length >= 6) out = out.split(s).join("***");
  }
  out = out.replace(/Bearer\s+\S+/gi, "Bearer ***");
  out = out.replace(/\b(sk|app|key)-[A-Za-z0-9._-]{6,}/gi, "$1-***");
  return out.slice(0, 300);
}

/** Normalize a base URL: strip trailing slashes; empty path → append /v1. */
export function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  try {
    const u = new URL(trimmed);
    if (u.pathname === "" || u.pathname === "/") return `${u.origin}/v1`;
    return trimmed;
  } catch {
    return trimmed;
  }
}

export interface ConnectionResult {
  success: boolean;
  latencyMs: number | null;
  message: string;
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
    if (res.ok) return { success: true, latencyMs, message: `HTTP ${res.status}` };
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

/**
 * Generic provider connectivity test: GET {base}/models with the resolved
 * secret. This is intentionally NOT provider-type-specific — the schema has no
 * type column, so it must not claim to validate a Dify workflow.
 */
export async function testProvider(provider: {
  base_url: string | null;
  secret_ref: string | null;
}): Promise<ConnectionResult> {
  if (!provider.base_url?.trim()) {
    return { success: false, latencyMs: null, message: "未配置 base_url" };
  }
  const resolved = resolveSecret(provider.secret_ref);
  if (!resolved.ok) return { success: false, latencyMs: null, message: resolved.reason };

  const url = `${normalizeBaseUrl(provider.base_url)}/models`;
  const result = await timedFetch(url, { Authorization: `Bearer ${resolved.value}` }, [
    resolved.value,
  ]);
  return {
    ...result,
    message: result.success
      ? `通用 models 连通性测试通过（HTTP 200）`
      : `通用 models 连通性测试失败：${result.message}`,
  };
}

/** Dify workflow connectivity test: GET {normalize(base_url)}/parameters. */
export async function testDifyWorkflow(
  workflow: { secret_ref: string | null },
  provider: { base_url: string | null; secret_ref: string | null } | null,
): Promise<ConnectionResult> {
  if (!provider)
    return { success: false, latencyMs: null, message: "未找到该工作流对应的 Provider" };
  if (!provider.base_url?.trim()) {
    return { success: false, latencyMs: null, message: "Provider 未配置 base_url" };
  }
  const ref = workflow.secret_ref?.trim() || provider.secret_ref?.trim() || null;
  const resolved = resolveSecret(ref);
  if (!resolved.ok) return { success: false, latencyMs: null, message: resolved.reason };

  const url = `${normalizeBaseUrl(provider.base_url)}/parameters`;
  const result = await timedFetch(url, { Authorization: `Bearer ${resolved.value}` }, [
    resolved.value,
  ]);
  return {
    ...result,
    message: result.success
      ? `Dify /parameters 连通性测试通过（HTTP 200）`
      : `Dify /parameters 测试失败：${result.message}`,
  };
}
