// Shared, client-safe types for the AI Studio control plane.
// No secrets, no provider endpoints — just the shape of the config rows.

export type Role = "admin" | "operator" | "editor" | "user";

export type SecretSource = "cloudflare_env" | "supabase_vault";

export interface Provider {
  id: string;
  slug: string;
  name: string;
  kind: string;
  base_url: string | null;
  secret_ref: string | null;
  secret_source: SecretSource;
  enabled: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Model {
  id: string;
  provider_id: string;
  model_key: string;
  display_name: string;
  upstream_id: string;
  description: string;
  capabilities: string[];
  slots: string[];
  enabled: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ModelWithProvider extends Model {
  provider: Pick<Provider, "id" | "name" | "slug" | "enabled" | "secret_ref"> | null;
  /** enabled ≠ callable: a model is "provider_unavailable" when its Provider
   *  is disabled or has no secret_ref. */
  status: ModelStatus;
}

export type ModelStatus = "enabled" | "disabled" | "provider_unavailable";

export interface Workflow {
  id: string;
  key: string;
  label: string;
  dify_app_id: string | null;
  app_type: "workflow" | "chatflow";
  secret_ref: string | null;
  secret_source: SecretSource;
  enabled: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeBase {
  id: string;
  name: string;
  scope: "global" | "project";
  source: "dify_dataset" | "pgvector";
  external_id: string | null;
  description: string;
  enabled: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ActivityEvent {
  id: string;
  type: string;
  title: string;
  actor_user_id: string | null;
  metadata: Record<string, string | number | boolean | null>;
  created_at: string;
}

export interface UsageEvent {
  id: string;
  user_id: string;
  capability: string;
  model_key: string | null;
  workflow_key: string | null;
  tokens_in: number;
  tokens_out: number;
  cost: number;
  latency_ms: number | null;
  status: string;
  created_at: string;
}

export interface UserQuota {
  user_id: string;
  period: string;
  token_limit: number | null;
  token_used: number;
  cost_limit: number | null;
  cost_used: number;
  updated_at: string;
}

export interface QuotaInfo {
  user_id: string;
  period: string;
  token_limit: number | null;
  token_used: number;
  cost_limit: number | null;
  cost_used: number;
}

export interface AdminUser {
  id: string;
  email: string | null;
  role: Role;
  created_at: string | null;
  last_sign_in_at: string | null;
  token_used: number;
  token_limit: number | null;
  cost_used: number;
}

export const CAPABILITY_LABELS: Record<string, string> = {
  chat: "Chat",
  reasoning: "Reasoning",
  vision: "Vision",
  tool_calling: "Tool Calling",
};

export const SLOT_LABELS: Record<string, string> = {
  navigator: "Project Navigator",
  research: "Research",
  product: "Product",
  architecture: "Architecture",
  build: "Build",
};

export type HealthState = "ok" | "warn" | "down" | "unknown";

export interface HealthItem {
  key: string;
  label: string;
  state: HealthState;
  detail: string;
}

export interface CapabilitySummary {
  models: { total: number; enabled: number; configured: number };
  workflows: { total: number; connected: number; pending: number };
}

export interface AlertItem {
  severity: "warning" | "error";
  title: string;
  detail: string;
}
