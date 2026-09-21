import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getUserQuota, listUsers, setUserQuota } from "@/lib/admin.functions";
import type { AdminUser } from "@/lib/control-plane";

export const Route = createFileRoute("/_admin/users")({
  component: UsersPage,
});

function fmtDate(v: string | null) {
  return v ? new Date(v).toLocaleString("zh-CN") : "—";
}

function numOrNull(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function QuotaDialog({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data: quota, isLoading } = useQuery({
    queryKey: ["quota", user.id],
    queryFn: () => getUserQuota({ data: { userId: user.id } }),
  });

  const [tokenLimit, setTokenLimit] = useState<string>("");
  const [costLimit, setCostLimit] = useState<string>("");
  const [period, setPeriod] = useState("monthly");
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!quota || initialized) return;
    setTokenLimit(quota.token_limit != null ? String(quota.token_limit) : "");
    setCostLimit(quota.cost_limit != null ? String(quota.cost_limit) : "");
    setPeriod(quota.period);
    setInitialized(true);
  }, [quota, initialized]);

  const mutation = useMutation({
    mutationFn: () =>
      setUserQuota({
        data: {
          userId: user.id,
          tokenLimit: numOrNull(tokenLimit),
          costLimit: numOrNull(costLimit),
          period: period as "daily" | "weekly" | "monthly",
        },
      }),
    onSuccess: () => {
      toast.success("额度已保存");
      queryClient.invalidateQueries();
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "保存失败"),
  });

  const used = quota?.token_used ?? 0;
  const remaining = quota?.token_limit != null ? quota.token_limit - used : null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>设置额度 · {user.email ?? user.id}</DialogTitle>
          <DialogDescription>
            仅设置额度上限；本阶段不做真实扣费（token_used 由 Gateway 后续写入）。
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">加载中…</p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">已用</p>
                <p className="mt-1 font-semibold">{used.toLocaleString()}</p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">上限</p>
                <p className="mt-1 font-semibold">
                  {quota?.token_limit != null ? quota.token_limit.toLocaleString() : "不限"}
                </p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">剩余</p>
                <p className="mt-1 font-semibold">
                  {remaining != null ? remaining.toLocaleString() : "—"}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tokenLimit">Token 上限（留空 = 不限）</Label>
              <Input
                id="tokenLimit"
                type="number"
                min={0}
                value={tokenLimit}
                onChange={(e) => setTokenLimit(e.target.value)}
                placeholder="例如 1000000"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="costLimit">成本上限 USD（留空 = 不限）</Label>
              <Input
                id="costLimit"
                type="number"
                min={0}
                step="0.01"
                value={costLimit}
                onChange={(e) => setCostLimit(e.target.value)}
                placeholder="例如 10"
              />
            </div>
            <div className="space-y-2">
              <Label>周期</Label>
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">daily</SelectItem>
                  <SelectItem value="weekly">weekly</SelectItem>
                  <SelectItem value="monthly">monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || isLoading}>
            {mutation.isPending && <Loader2 className="animate-spin" />}
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UsersPage() {
  const [editing, setEditing] = useState<AdminUser | null>(null);

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
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                  加载中…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && users.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
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
                  {u.token_limit != null ? ` / ${u.token_limit.toLocaleString()}` : " / 不限"}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {fmtDate(u.created_at)}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {fmtDate(u.last_sign_in_at)}
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => setEditing(u)}>
                    设置额度
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {editing && <QuotaDialog user={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
