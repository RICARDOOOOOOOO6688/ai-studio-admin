import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Check, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getModel } from "@/lib/admin.functions";
import { CAPABILITY_LABELS, SLOT_LABELS } from "@/lib/control-plane";

export const Route = createFileRoute("/_admin/models/$modelId")({
  component: ModelDetailPage,
});

const ALL_CAPABILITIES = ["chat", "reasoning", "vision", "tool_calling"];
const ALL_SLOTS = ["navigator", "research", "product", "architecture", "build"];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border py-2 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-right text-sm">{children}</span>
    </div>
  );
}

function Toggle({ on, label }: { on: boolean; label: string }) {
  return (
    <span className="flex items-center gap-2 text-sm">
      {on ? (
        <Check className="size-4 text-emerald-500" />
      ) : (
        <X className="size-4 text-muted-foreground" />
      )}
      <span className={on ? "" : "text-muted-foreground"}>{label}</span>
    </span>
  );
}

function ModelDetailPage() {
  const { modelId } = Route.useParams();
  const {
    data: model,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["model", modelId],
    queryFn: () => getModel({ data: { modelId } }),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">加载中…</p>;
  if (error || !model) return <p className="text-sm text-destructive">加载失败</p>;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <div>
        <Link
          to="/models"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Models
        </Link>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">{model.display_name}</h1>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">基本信息</CardTitle>
        </CardHeader>
        <CardContent>
          <Field label="显示名称">{model.display_name}</Field>
          <Field label="模型 Key">
            <span className="font-mono text-xs">{model.model_key}</span>
          </Field>
          <Field label="Provider">
            {model.provider ? (
              <Link
                to="/providers/$providerId"
                params={{ providerId: model.provider.id }}
                className="text-primary hover:underline"
              >
                {model.provider.name}
              </Link>
            ) : (
              "—"
            )}
          </Field>
          <Field label="模型 ID">
            <span className="font-mono text-xs">{model.upstream_id}</span>
          </Field>
          <Field label="描述">{model.description || "—"}</Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">能力</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {ALL_CAPABILITIES.map((c) => (
            <Toggle key={c} on={model.capabilities.includes(c)} label={CAPABILITY_LABELS[c] ?? c} />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">使用状态</CardTitle>
        </CardHeader>
        <CardContent>
          {model.enabled ? (
            <Badge className="bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/15">
              已启用
            </Badge>
          ) : (
            <Badge variant="secondary">未启用</Badge>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">可用于</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {ALL_SLOTS.map((s) => (
            <Toggle key={s} on={model.slots.includes(s)} label={SLOT_LABELS[s] ?? s} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
