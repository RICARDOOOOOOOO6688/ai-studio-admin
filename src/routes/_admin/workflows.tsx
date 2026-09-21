import { createFileRoute } from "@tanstack/react-router";
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
import { listWorkflows } from "@/lib/admin.functions";

export const Route = createFileRoute("/_admin/workflows")({
  component: WorkflowsPage,
});

function WorkflowsPage() {
  const { data: workflows = [], isLoading } = useQuery({
    queryKey: ["workflows"],
    queryFn: () => listWorkflows(),
  });

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Workflows</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Dify 工作流编排（当前仅展示配置状态）。
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>工作流</TableHead>
              <TableHead>类型</TableHead>
              <TableHead>Dify App ID</TableHead>
              <TableHead>密钥引用</TableHead>
              <TableHead>连接状态</TableHead>
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
            {!isLoading && workflows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                  暂无工作流
                </TableCell>
              </TableRow>
            )}
            {workflows.map((w) => {
              const connected = Boolean(w.dify_app_id && w.secret_ref);
              return (
                <TableRow key={w.id}>
                  <TableCell>
                    <span className="font-medium">{w.label}</span>
                    <span className="ml-2 font-mono text-xs text-muted-foreground">{w.key}</span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{w.app_type}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {w.dify_app_id ?? <span className="text-muted-foreground">未配置</span>}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {w.secret_ref ?? <span className="text-muted-foreground">未配置</span>}
                  </TableCell>
                  <TableCell>
                    {connected ? (
                      <Badge className="bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/15">
                        已连接
                      </Badge>
                    ) : (
                      <Badge variant="secondary">待配置</Badge>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
