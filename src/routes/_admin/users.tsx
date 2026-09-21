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
import { listUsers } from "@/lib/admin.functions";

export const Route = createFileRoute("/_admin/users")({
  component: UsersPage,
});

function fmtDate(v: string | null) {
  return v ? new Date(v).toLocaleString("zh-CN") : "—";
}

function UsersPage() {
  const { data: users = [], isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: () => listUsers(),
  });

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">用户</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          来自 Supabase Auth；角色与额度来自 user_roles / user_quotas。
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>邮箱</TableHead>
              <TableHead>角色</TableHead>
              <TableHead>Token 用量</TableHead>
              <TableHead>注册时间</TableHead>
              <TableHead>最近登录</TableHead>
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
            {!isLoading && users.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                  暂无用户
                </TableCell>
              </TableRow>
            )}
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="text-sm">{u.email ?? "—"}</TableCell>
                <TableCell>
                  {u.role === "admin" ? (
                    <Badge className="bg-primary/15 text-primary hover:bg-primary/15">admin</Badge>
                  ) : (
                    <Badge variant="secondary">{u.role}</Badge>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {u.token_used.toLocaleString()}
                  {u.token_limit != null ? ` / ${u.token_limit.toLocaleString()}` : ""}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {fmtDate(u.created_at)}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {fmtDate(u.last_sign_in_at)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
