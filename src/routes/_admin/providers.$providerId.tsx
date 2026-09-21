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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getProvider, testProviderConnection, updateProvider } from "@/lib/admin.functions";
import type { SecretSource } from "@/lib/control-plane";

export const Route = createFileRoute("/_admin/providers/$providerId")({
  component: ProviderDetailPage,
});

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border py-2 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-right text-sm">{children}</span>
    </div>
  );
}

function ProviderDetailPage() {
  const { providerId } = Route.useParams();
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["provider", providerId],
    queryFn: () => getProvider({ data: { providerId } }),
  });

  const provider = data?.provider;

  const [secretRef, setSecretRef] = useState("");
  const [secretSource, setSecretSource] = useState<SecretSource>("cloudflare_env");
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (!provider) return;
    setSecretRef(provider.secret_ref ?? "");
    setSecretSource(provider.secret_source);
    setEnabled(provider.enabled);
  }, [provider]);

  const save = useMutation({
    mutationFn: () =>
      updateProvider({
        data: {
          providerId,
          secretRef: secretRef.trim() || null,
          secretSource,
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
      if (r.success) toast.success(`连接成功 · ${r.latencyMs ?? 0}ms`);
      else toast.error(r.message);
      queryClient.invalidateQueries({ queryKey: ["activity"] });
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
        <h1 className="mt-2 text-xl font-semibold tracking-tight">{data.provider.name}</h1>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">基本信息</CardTitle>
        </CardHeader>
        <CardContent>
          <Field label="Slug">
            <span className="font-mono text-xs">{data.provider.slug}</span>
          </Field>
          <Field label="类型">{data.provider.kind}</Field>
          <Field label="Base URL">
            <span className="font-mono text-xs">{data.provider.base_url ?? "—"}</span>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">密钥与启用状态</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="secretRef">密钥引用（secret_ref）</Label>
            <Input
              id="secretRef"
              value={secretRef}
              onChange={(e) => setSecretRef(e.target.value)}
              placeholder="例如 OPENAI_API_KEY（留空表示清除）"
              className="font-mono text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label>来源（secret_source）</Label>
            <Select value={secretSource} onValueChange={(v) => setSecretSource(v as SecretSource)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cloudflare_env">cloudflare_env</SelectItem>
                <SelectItem value="supabase_vault">supabase_vault</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
            <Label htmlFor="enabled">启用</Label>
            <Switch id="enabled" checked={enabled} onCheckedChange={setEnabled} />
          </div>

          <p className="text-xs text-muted-foreground">
            真实密钥不存于数据库：运行时按「来源」从 Cloudflare 绑定或 Supabase Vault 解析。
          </p>

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
              {test.data.success
                ? `✓ ${test.data.message}（${test.data.latencyMs ?? 0}ms）`
                : `✗ ${test.data.message}`}
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
                    {m.display_name}
                  </Link>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{m.upstream_id}</span>
                    {m.enabled ? (
                      <Badge variant="secondary" className="text-[10px]">
                        启用
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">
                        停用
                      </Badge>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
