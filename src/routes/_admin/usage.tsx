import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getUsageSummary } from "@/lib/admin.functions";

export const Route = createFileRoute("/_admin/usage")({
  component: UsagePage,
});

function UsagePage() {
  const { data } = useQuery({ queryKey: ["usage"], queryFn: () => getUsageSummary() });

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">用量</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          数据来自 usage_events。Token 仅在 Dify 返回时记录，未返回时为 0（表示未测量）。
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">输入 Token</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{(data?.totalInput ?? 0).toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">输出 Token</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{(data?.totalOutput ?? 0).toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">运行次数</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{data?.events ?? 0}</p>
          </CardContent>
        </Card>
      </div>

      <div className="rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Workflow</TableHead>
              <TableHead>输入 Token</TableHead>
              <TableHead>输出 Token</TableHead>
              <TableHead>运行次数</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!data || data.byWorkflow.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                  暂无用量数据（等待 Gateway 写入 usage_events）
                </TableCell>
              </TableRow>
            ) : (
              data.byWorkflow.map((row) => (
                <TableRow key={row.workflowKey}>
                  <TableCell className="text-sm">{row.workflowKey}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {row.input.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {row.output.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{row.events}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
