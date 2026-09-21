import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Pencil, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import { listProviders, testProviderConnection, updateProvider } from "@/lib/admin.functions";
import type { Provider, SecretSource } from "@/lib/control-plane";

export const Route = createFileRoute("/_admin/providers")({
  component: ProvidersPage,
});

function ProviderEditDialog({ provider, onClose }: { provider: Provider; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [secretRef, setSecretRef] = useState(provider.secret_ref ?? "");
  const [secretSource, setSecretSource] = useState<SecretSource>(provider.secret_source);
  const [enabled, setEnabled] = useState(provider.enabled);

  const mutation = useMutation({
    mutationFn: () =>
      updateProvider({
        data: {
          providerId: provider.id,
          secretRef: secretRef.trim() || null,
          secretSource,
          enabled,
        },
      }),
    onSuccess: () => {
      toast.success("已保存");
      queryClient.invalidateQueries();
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "保存失败"),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>编辑 {provider.name}</DialogTitle>
          <DialogDescription>
            只配置「密钥引用」，不写入密钥本身。真实值在运行时按来源解析。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
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
            <p className="text-xs text-muted-foreground">
              supabase_vault 的密钥写入尚未连接（第二阶段仅结构 + 状态显示）。
            </p>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
            <Label htmlFor="enabled">启用此 Provider</Label>
            <Switch id="enabled" checked={enabled} onCheckedChange={setEnabled} />
          </div>
          <p className="text-xs text-muted-foreground">
            描述字段当前 schema 不支持，需要迁移后才有（见阶段报告）。
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="animate-spin" />}
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProvidersPage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Provider | null>(null);

  const { data: providers = [], isLoading } = useQuery({
    queryKey: ["providers"],
    queryFn: () => listProviders(),
  });

  const toggle = useMutation({
    mutationFn: (vars: { providerId: string; enabled: boolean }) => updateProvider({ data: vars }),
    onSuccess: () => {
      toast.success("已更新");
      queryClient.invalidateQueries();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "更新失败"),
  });

  const test = useMutation({
    mutationFn: (providerId: string) => testProviderConnection({ data: { providerId } }),
    onSuccess: (r) => {
      if (r.success) toast.success(`连接成功 · ${r.latencyMs ?? 0}ms`);
      else toast.error(r.message);
      queryClient.invalidateQueries({ queryKey: ["activity"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "测试失败"),
  });

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Providers</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Provider 与 Model 分层。密钥只存引用，不落库。
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>名称</TableHead>
              <TableHead>类型</TableHead>
              <TableHead>密钥引用</TableHead>
              <TableHead>来源</TableHead>
              <TableHead>启用</TableHead>
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
            {!isLoading && providers.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
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
                <TableCell className="font-mono text-xs">
                  {p.secret_ref ? (
                    p.secret_ref
                  ) : (
                    <span className="text-muted-foreground">未配置</span>
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{p.secret_source}</TableCell>
                <TableCell>
                  <Switch
                    checked={p.enabled}
                    disabled={toggle.isPending && toggle.variables?.providerId === p.id}
                    onCheckedChange={(v) => toggle.mutate({ providerId: p.id, enabled: v })}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => test.mutate(p.id)}
                      disabled={test.isPending && test.variables === p.id}
                    >
                      {test.isPending && test.variables === p.id ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <Zap />
                      )}
                      测试连接
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setEditing(p)}>
                      <Pencil />
                      编辑
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {editing && <ProviderEditDialog provider={editing} onClose={() => setEditing(null)} />}

      <p className="text-xs text-muted-foreground">
        说明：Provider 状态为「启用」不代表可用——还需配置对应 Model 与可解析的密钥。
      </p>
    </div>
  );
}
