import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { getModel, updateModel } from "@/lib/admin.functions";
import { CAPABILITY_LABELS, type ModelStatus } from "@/lib/control-plane";

export const Route = createFileRoute("/_admin/models/$modelId")({
  component: ModelDetailPage,
});

const ALL_CAPABILITIES = ["chat", "reasoning", "vision", "tool_calling"];

const STATUS_LABEL: Record<ModelStatus, string> = {
  enabled: "已启用",
  disabled: "已停用",
  provider_unavailable: "Provider 不可用",
};

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function ModelDetailPage() {
  const { modelId } = Route.useParams();
  const queryClient = useQueryClient();
  const {
    data: model,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["model", modelId],
    queryFn: () => getModel({ data: { modelId } }),
  });

  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [capabilities, setCapabilities] = useState<string[]>([]);

  useEffect(() => {
    if (!model) return;
    setKey(model.key);
    setName(model.name);
    setDescription(model.description);
    setEnabled(model.enabled);
    setCapabilities(model.capabilities);
  }, [model]);

  const save = useMutation({
    mutationFn: () =>
      updateModel({ data: { modelId, key, name, description, enabled, capabilities } }),
    onSuccess: () => {
      toast.success("已保存");
      queryClient.invalidateQueries();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "保存失败"),
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
        <div className="mt-2 flex items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight">{model.name}</h1>
          <Badge
            className={
              model.status === "enabled"
                ? "bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/15"
                : model.status === "provider_unavailable"
                  ? "bg-amber-500/15 text-amber-600 hover:bg-amber-500/15"
                  : ""
            }
            variant={model.status === "disabled" ? "secondary" : "default"}
          >
            {STATUS_LABEL[model.status]}
          </Badge>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">基本信息</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="key">Key</Label>
              <Input
                id="key"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                className="font-mono text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">名称</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">描述</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="space-y-1 text-sm">
            <span className="text-muted-foreground">Provider：</span>
            {model.provider ? (
              <Link
                to="/providers/$providerId"
                params={{ providerId: model.provider.id }}
                className="text-primary hover:underline"
              >
                {model.provider.name}
              </Link>
            ) : (
              "未关联"
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">能力</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {ALL_CAPABILITIES.map((c) => (
            <label key={c} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={capabilities.includes(c)}
                onCheckedChange={() => setCapabilities((prev) => toggle(prev, c))}
              />
              {CAPABILITY_LABELS[c] ?? c}
            </label>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">使用状态</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
            <Label htmlFor="enabled">启用</Label>
            <Switch id="enabled" checked={enabled} onCheckedChange={setEnabled} />
          </div>
          <p className="text-xs text-muted-foreground">
            模型目录不参与 Dify 执行；实际模型由 Dify 决定。
          </p>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="animate-spin" />}
            保存
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
