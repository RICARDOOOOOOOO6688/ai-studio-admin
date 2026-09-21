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
import { listModels } from "@/lib/admin.functions";
import { SLOT_LABELS } from "@/lib/control-plane";

export const Route = createFileRoute("/_admin/models")({
  component: ModelsPage,
});

function ModelsPage() {
  const { data: models = [], isLoading } = useQuery({
    queryKey: ["models"],
    queryFn: () => listModels(),
  });

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Models</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          模型归属于 Provider，对外以 model_key 暴露。
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>名称</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>用途</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                  加载中…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && models.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                  暂无模型
                </TableCell>
              </TableRow>
            )}
            {models.map((m) => (
              <TableRow key={m.id}>
                <TableCell>
                  <Link
                    to="/models/$modelId"
                    params={{ modelId: m.id }}
                    className="font-medium text-primary hover:underline"
                  >
                    {m.display_name}
                  </Link>
                  <span className="ml-2 font-mono text-xs text-muted-foreground">
                    {m.model_key}
                  </span>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {m.provider?.name ?? "—"}
                </TableCell>
                <TableCell>
                  {m.enabled ? (
                    <Badge className="bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/15">
                      启用
                    </Badge>
                  ) : (
                    <Badge variant="secondary">停用</Badge>
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {m.slots.length === 0 ? "—" : m.slots.map((s) => SLOT_LABELS[s] ?? s).join("、")}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
