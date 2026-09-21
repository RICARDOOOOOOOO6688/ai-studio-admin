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
import { listKnowledgeBases } from "@/lib/admin.functions";

export const Route = createFileRoute("/_admin/knowledge")({
  component: KnowledgePage,
});

function KnowledgePage() {
  const { data: bases = [], isLoading } = useQuery({
    queryKey: ["knowledge"],
    queryFn: () => listKnowledgeBases(),
  });

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Knowledge</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          平台级（global）与项目级（project）知识库。竞赛规则 / 评分标准等属于 global。
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>名称</TableHead>
              <TableHead>作用域</TableHead>
              <TableHead>来源</TableHead>
              <TableHead>External ID</TableHead>
              <TableHead>状态</TableHead>
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
            {!isLoading && bases.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                  暂无知识库
                </TableCell>
              </TableRow>
            )}
            {bases.map((kb) => (
              <TableRow key={kb.id}>
                <TableCell className="font-medium">{kb.name}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {kb.scope === "global" ? "平台级" : "项目级"}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{kb.source}</TableCell>
                <TableCell className="font-mono text-xs">
                  {kb.external_id ?? <span className="text-muted-foreground">未配置</span>}
                </TableCell>
                <TableCell>
                  {kb.enabled ? (
                    <Badge className="bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/15">
                      启用
                    </Badge>
                  ) : (
                    <Badge variant="secondary">停用</Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
