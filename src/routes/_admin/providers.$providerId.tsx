import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Zap } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { getProvider, testProviderConnection, updateProvider } from "@/lib/admin.functions";

export const Route = createFileRoute("/_admin/providers/$providerId")({
  component: ProviderDetailPage,
});

function ProviderDetailPage() {
  const { providerId } = Route.useParams();
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["provider", providerId],
    queryFn: () => getProvider({ data: { providerId } }),
  });

  const provider = data?.provider;

  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [secretRef, setSecretRef] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (!provider) return;
    setKey(provider.key);
    setName(provider.name);
    setDescription(provider.description);
    setSecretRef(provider.secret_ref ?? "");
    setBaseUrl(provider.base_url ?? "");
    setEnabled(provider.enabled);
  }, [provider]);

  const save = useMutation({
    mutationFn: () =>
      updateProvider({
        data: {
          providerId,
          key,
          name,
          description,
          secretRef: secretRef.trim() || null,
          baseUrl: baseUrl.trim() || null,
          enabled,
        },
      }),
    onSuccess: () => {
      toast.success("已保存");
      queryClient.invalidateQueries();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "保存失败"),
  });

  const test = useMutation({
    mutationFn: () => testProviderConnection({ data: { providerId } }),
    onSuccess: (r) => {
      if (r.success) toast.success(`通用 models 连通性测试通过 · ${r.latencyMs ?? 0}ms`);
      else toast.error(r.message);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "测试失败"),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">加载中…</p>;
  if (error || !data) return <p className="text-sm text-destructive">加载失败</p>;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <div>
        <Link
          to="/providers"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Providers
        </Link>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">{provider?.name}</h1>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">基本信息与密钥</CardTitle>
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
            <Label htmlFor="baseUrl">Base URL</Label>
            <Input
              id="baseUrl"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.deepseek.com/v1"
              className="font-mono text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">描述</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="secretRef">密钥引用（secret_ref）</Label>
            <Input
              id="secretRef"
              value={secretRef}
              onChange={(e) => setSecretRef(e.target.value)}
              placeholder="环境变量名（留空表示清除）"
              className="font-mono text-sm"
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
            <Label htmlFor="enabled">启用</Label>
            <Switch id="enabled" checked={enabled} onCheckedChange={setEnabled} />
          </div>

          <div className="flex gap-2">
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending && <Loader2 className="animate-spin" />}
              保存
            </Button>
            <Button variant="outline" onClick={() => test.mutate()} disabled={test.isPending}>
              {test.isPending ? <Loader2 className="animate-spin" /> : <Zap />}
              测试连接
            </Button>
          </div>
          {test.data && !test.isPending && (
            <p className={`text-xs ${test.data.success ? "text-emerald-600" : "text-destructive"}`}>
              {test.data.success ? `✓ ${test.data.message}` : `✗ ${test.data.message}`}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">该 Provider 下的模型（{data.models.length}）</CardTitle>
        </CardHeader>
        <CardContent>
          {data.models.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无模型</p>
          ) : (
            <ul className="space-y-2">
              {data.models.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3">
                  <Link
                    to="/models/$modelId"
                    params={{ modelId: m.id }}
                    className="text-sm text-primary hover:underline"
                  >
                    {m.name}
                  </Link>
                  <span className="font-mono text-xs text-muted-foreground">{m.key}</span>
                  <Badge variant="secondary" className="text-[10px]">
                    {m.enabled ? "启用" : "停用"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            该 Provider 下的工作流（{data.workflows.length}）
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.workflows.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无工作流</p>
          ) : (
            <ul className="space-y-2">
              {data.workflows.map((w) => (
                <li key={w.id} className="flex items-center justify-between gap-3">
                  <span className="text-sm">{w.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">{w.key}</span>
                  <Badge variant="secondary" className="text-[10px]">
                    {w.enabled ? "启用" : "停用"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
