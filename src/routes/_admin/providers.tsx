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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listProviders, testProviderConnection, updateProvider } from "@/lib/admin.functions";
import type { Provider } from "@/lib/control-plane";

export const Route = createFileRoute("/_admin/providers")({
  component: ProvidersPage,
});

function ProviderEditDialog({ provider, onClose }: { provider: Provider; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [key, setKey] = useState(provider.key);
  const [name, setName] = useState(provider.name);
  const [description, setDescription] = useState(provider.description);
  const [secretRef, setSecretRef] = useState(provider.secret_ref ?? "");
  const [enabled, setEnabled] = useState(provider.enabled);

  const mutation = useMutation({
    mutationFn: () =>
      updateProvider({
        data: {
          providerId: provider.id,
          key,
          name,
          description,
          secretRef: secretRef.trim() || null,
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
          <DialogDescription>只配置密钥引用，不写入密钥本身。</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="key">Key（逻辑标识）</Label>
              <Input
                id="key"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                className="font-mono text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">名称</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">描述</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="secretRef">密钥引用（secret_ref）</Label>
            <Input
              id="secretRef"
              value={secretRef}
              onChange={(e) => setSecretRef(e.target.value)}
              placeholder="环境变量名，例如 DIFY_API_KEY（留空表示清除）"
              className="font-mono text-sm"
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
            <Label htmlFor="enabled">启用</Label>
            <Switch id="enabled" checked={enabled} onCheckedChange={setEnabled} />
          </div>
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
      if (r.success) toast.success(`通用 models 连通性测试通过 · ${r.latencyMs ?? 0}ms`);
      else toast.error(r.message);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "测试失败"),
  });

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Providers</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          连接目标：base_url + secret_ref。Workflow / Model 通过 provider_key 逻辑归属。
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>名称</TableHead>
              <TableHead>Base URL</TableHead>
              <TableHead>密钥引用</TableHead>
              <TableHead>启用</TableHead>
              <TableHead className="text-right">操作</TableHead>
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
                  <span className="ml-2 font-mono text-xs text-muted-foreground">{p.key}</span>
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {p.base_url ?? <span className="text-muted-foreground">未配置</span>}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {p.secret_ref ?? <span className="text-muted-foreground">未配置</span>}
                </TableCell>
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
        说明：「测试连接」是通用 <code className="font-mono">/models</code>{" "}
        连通性测试，不代表已验证任何具体 Provider 类型。
      </p>
    </div>
  );
}
