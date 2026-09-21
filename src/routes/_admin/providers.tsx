import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listProviders } from "@/lib/admin.functions";

export const Route = createFileRoute("/_admin/providers")({
  component: ProvidersPage,
});

function StatusBadge({ enabled }: { enabled: boolean }) {
  return enabled ? (
    <Badge className="bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/15">启用</Badge>
  ) : (
    <Badge variant="secondary">停用</Badge>
  );
}

function ProvidersPage() {
  const { data: providers = [], isLoading } = useQuery({
    queryKey: ["providers"],
    queryFn: () => listProviders(),
  });

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Providers</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Provider 与 Model 分层：换模型不影响 Provider。
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>名称</TableHead>
              <TableHead>类型</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>密钥引用</TableHead>
              <TableHead>来源</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                  加载中…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && providers.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                  暂无 Provider
                </TableCell>
              </TableRow>
            )}
            {providers.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <Link
                    to="/providers/$providerId"
                    params={{ providerId: p.id }}
                    className="font-medium text-primary hover:underline"
                  >
                    {p.name}
                  </Link>
                  <span className="ml-2 text-xs text-muted-foreground">{p.slug}</span>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{p.kind}</TableCell>
                <TableCell>
                  <StatusBadge enabled={p.enabled} />
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {p.secret_ref ? (
                    p.secret_ref
                  ) : (
                    <span className="text-muted-foreground">未配置</span>
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{p.secret_source}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
