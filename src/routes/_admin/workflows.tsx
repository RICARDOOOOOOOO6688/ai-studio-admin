import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Pencil, Zap } from "lucide-react";

import { Badge } from "@/components/ui/badge";
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
import {
  listProviders,
  listWorkflows,
  testWorkflowConnection,
  updateWorkflow,
} from "@/lib/admin.functions";
import type { WorkflowWithProvider } from "@/lib/control-plane";

export const Route = createFileRoute("/_admin/workflows")({
  component: WorkflowsPage,
});

const NO_PROVIDER = "__none__";

function WorkflowEditDialog({
  workflow,
  onClose,
}: {
  workflow: WorkflowWithProvider;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: providers = [] } = useQuery({
    queryKey: ["providers"],
    queryFn: () => listProviders(),
  });
  const [key, setKey] = useState(workflow.key);
  const [name, setName] = useState(workflow.name);
  const [description, setDescription] = useState(workflow.description);
  const [secretRef, setSecretRef] = useState(workflow.secret_ref ?? "");
  const [providerKey, setProviderKey] = useState(workflow.provider_key ?? NO_PROVIDER);
  const [enabled, setEnabled] = useState(workflow.enabled);
  const [sortOrder, setSortOrder] = useState(String(workflow.sort_order));

  const mutation = useMutation({
    mutationFn: () =>
      updateWorkflow({
        data: {
          workflowId: workflow.id,
          key,
          name,
          description,
          secretRef: secretRef.trim() || null,
          providerKey: providerKey === NO_PROVIDER ? null : providerKey,
          enabled,
          sortOrder: Number.parseInt(sortOrder, 10) || 0,
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
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>编辑 {workflow.name}</DialogTitle>
          <DialogDescription>
            「已连接」= 启用 + Provider 启用且有 base_url + (workflow 或 provider 的 secret_ref)
            有值。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="key">Key</Label>
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
            <Label>Provider（provider_key）</Label>
            <Select value={providerKey} onValueChange={setProviderKey}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_PROVIDER}>（不关联）</SelectItem>
                {providers.map((p) => (
                  <SelectItem key={p.id} value={p.key}>
                    {p.name} ({p.key})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="secretRef">密钥引用（secret_ref，可空则回退 provider）</Label>
            <Input
              id="secretRef"
              value={secretRef}
              onChange={(e) => setSecretRef(e.target.value)}
              placeholder="留空则使用 Provider 的 secret_ref"
              className="font-mono text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sortOrder">排序</Label>
            <Input
              id="sortOrder"
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
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

function WorkflowsPage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<WorkflowWithProvider | null>(null);

  const { data: workflows = [], isLoading } = useQuery({
    queryKey: ["workflows"],
    queryFn: () => listWorkflows(),
  });

  const toggle = useMutation({
    mutationFn: (vars: { workflowId: string; enabled: boolean }) => updateWorkflow({ data: vars }),
    onSuccess: () => {
      toast.success("已更新");
      queryClient.invalidateQueries();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "更新失败"),
  });

  const test = useMutation({
    mutationFn: (workflowId: string) => testWorkflowConnection({ data: { workflowId } }),
    onSuccess: (r) => {
      if (r.success) toast.success(`Dify /parameters 连通性测试通过 · ${r.latencyMs ?? 0}ms`);
      else toast.error(r.message);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "测试失败"),
  });

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Workflows</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          可执行单元。通过 provider_key 找到 base_url；密钥取 workflow.secret_ref，缺则回退
          provider。
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>工作流</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>密钥引用</TableHead>
              <TableHead>连接状态</TableHead>
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
            {!isLoading && workflows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                  暂无工作流
                </TableCell>
              </TableRow>
            )}
            {workflows.map((w) => (
              <TableRow key={w.id}>
                <TableCell>
                  <span className="font-medium">{w.name}</span>
                  <span className="ml-2 font-mono text-xs text-muted-foreground">{w.key}</span>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {w.provider?.name ?? "—"}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {w.secret_ref ?? <span className="text-muted-foreground">回退 provider</span>}
                </TableCell>
                <TableCell>
                  {w.connected ? (
                    <Badge className="bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/15">
                      已连接
                    </Badge>
                  ) : (
                    <Badge variant="secondary">待配置</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <Switch
                    checked={w.enabled}
                    disabled={toggle.isPending && toggle.variables?.workflowId === w.id}
                    onCheckedChange={(v) => toggle.mutate({ workflowId: w.id, enabled: v })}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => test.mutate(w.id)}
                      disabled={test.isPending && test.variables === w.id}
                    >
                      {test.isPending && test.variables === w.id ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <Zap />
                      )}
                      测试
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setEditing(w)}>
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

      {editing && <WorkflowEditDialog workflow={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
