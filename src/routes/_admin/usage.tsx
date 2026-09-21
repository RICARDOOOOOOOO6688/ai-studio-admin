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
        <p className="mt-1 text-sm text-muted-foreground">按 token 计量。数据来自 usage_events。</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">总 Token</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{(data?.totalTokens ?? 0).toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">总成本</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">${(data?.totalCost ?? 0).toFixed(4)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">事件数</CardTitle>
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
              <TableHead>能力</TableHead>
              <TableHead>Token</TableHead>
              <TableHead>成本</TableHead>
              <TableHead>事件</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!data || data.byCapability.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                  暂无用量数据（等待 Gateway 写入 usage_events）
                </TableCell>
              </TableRow>
            ) : (
              data.byCapability.map((row) => (
                <TableRow key={row.capability}>
                  <TableCell className="text-sm">{row.capability}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {row.tokens.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    ${row.cost.toFixed(4)}
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
