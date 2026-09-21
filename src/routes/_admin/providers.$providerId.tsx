import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getProvider } from "@/lib/admin.functions";

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
  const { data, isLoading, error } = useQuery({
    queryKey: ["provider", providerId],
    queryFn: () => getProvider({ data: { providerId } }),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">加载中…</p>;
  if (error || !data) return <p className="text-sm text-destructive">加载失败</p>;

  const { provider, models } = data;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <div>
        <Link
          to="/providers"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Providers
        </Link>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">{provider.name}</h1>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">基本信息</CardTitle>
        </CardHeader>
        <CardContent>
          <Field label="Slug">
            <span className="font-mono text-xs">{provider.slug}</span>
          </Field>
          <Field label="类型">{provider.kind}</Field>
          <Field label="Base URL">
            <span className="font-mono text-xs">{provider.base_url ?? "—"}</span>
          </Field>
          <Field label="状态">
            {provider.enabled ? (
              <Badge className="bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/15">
                启用
              </Badge>
            ) : (
              <Badge variant="secondary">停用</Badge>
            )}
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">密钥</CardTitle>
        </CardHeader>
        <CardContent>
          <Field label="密钥引用">
            <span className="font-mono text-xs">{provider.secret_ref ?? "未配置"}</span>
          </Field>
          <Field label="来源">{provider.secret_source}</Field>
          <p className="mt-3 text-xs text-muted-foreground">
            真实密钥不存于数据库：运行时按「来源」从 Cloudflare 绑定或 Supabase Vault 解析。
          </p>
          <Button variant="outline" size="sm" className="mt-3" disabled>
            测试连接（第二阶段）
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">该 Provider 下的模型（{models.length}）</CardTitle>
        </CardHeader>
        <CardContent>
          {models.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无模型</p>
          ) : (
            <ul className="space-y-2">
              {models.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3">
                  <Link
                    to="/models/$modelId"
                    params={{ modelId: m.id }}
                    className="text-sm text-primary hover:underline"
                  >
                    {m.display_name}
                  </Link>
                  <span className="font-mono text-xs text-muted-foreground">{m.upstream_id}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
