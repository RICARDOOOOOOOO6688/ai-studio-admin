// Shared, client-safe types for the authoritative ai_* control plane.
// No secrets — only references and catalog metadata.

export type Role = "admin" | "user";

/** public.ai_providers */
export interface Provider {
  id: string;
  key: string;
  name: string;
  description: string;
  base_url: string | null;
  secret_ref: string | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

/** public.ai_models */
export interface Model {
  id: string;
  key: string;
  name: string;
  description: string;
  capabilities: string[];
  provider_key: string | null;
  enabled: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type ModelStatus = "enabled" | "disabled" | "provider_unavailable";

export interface ModelWithProvider extends Model {
  provider: {
    id: string;
    key: string;
    name: string;
    enabled: boolean;
    secret_ref: string | null;
  } | null;
  /** enabled ≠ callable; "provider_unavailable" when the provider is off / has no secret. */
  status: ModelStatus;
}

/** public.ai_workflows */
export interface Workflow {
  id: string;
  key: string;
  name: string;
  description: string;
  secret_ref: string | null;
  provider_key: string | null;
  enabled: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface WorkflowWithProvider extends Workflow {
  provider: {
    id: string;
    key: string;
    name: string;
    base_url: string | null;
    enabled: boolean;
    secret_ref: string | null;
  } | null;
  /** enabled + provider enabled + base_url + a resolvable secret_ref. */
  connected: boolean;
}

/** public.usage_events — only the confirmed columns. */
export interface UsageEvent {
  id: string;
  user_id: string;
  project_id: string | null;
  workflow_key: string | null;
  model_key: string | null;
  provider_key: string | null;
  input_tokens: number;
  output_tokens: number;
  created_at: string;
}

export interface AdminUser {
  id: string;
  email: string | null;
  role: Role;
  created_at: string | null;
  last_sign_in_at: string | null;
}

export const CAPABILITY_LABELS: Record<string, string> = {
  chat: "Chat",
  reasoning: "Reasoning",
  vision: "Vision",
  tool_calling: "Tool Calling",
};

export type HealthState = "ok" | "warn" | "down" | "unknown";

export interface HealthItem {
  key: string;
  label: string;
  state: HealthState;
  detail: string;
}

export interface CapabilitySummary {
  providers: { total: number; enabled: number };
  models: { total: number; enabled: number; configured: number };
  workflows: { total: number; connected: number; pending: number };
}

export interface AlertItem {
  severity: "warning" | "error";
  title: string;
  detail: string;
}

export interface UsageSummary {
  events: number;
  totalInput: number;
  totalOutput: number;
  byWorkflow: { workflowKey: string; input: number; output: number; events: number }[];
}
