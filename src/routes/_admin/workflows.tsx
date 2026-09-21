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
import { listWorkflows, testWorkflowConnection, updateWorkflow } from "@/lib/admin.functions";
import type { SecretSource, Workflow } from "@/lib/control-plane";

export const Route = createFileRoute("/_admin/workflows")({
  component: WorkflowsPage,
});

function WorkflowEditDialog({ workflow, onClose }: { workflow: Workflow; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [label, setLabel] = useState(workflow.label);
  const [difyAppId, setDifyAppId] = useState(workflow.dify_app_id ?? "");
  const [appType, setAppType] = useState(workflow.app_type);
  const [secretRef, setSecretRef] = useState(workflow.secret_ref ?? "");
  const [secretSource, setSecretSource] = useState<SecretSource>(workflow.secret_source);
  const [enabled, setEnabled] = useState(workflow.enabled);

  const mutation = useMutation({
    mutationFn: () =>
      updateWorkflow({
        data: {
          workflowId: workflow.id,
          label,
          difyAppId: difyAppId.trim() || null,
          appType,
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
          <DialogTitle>编辑 {workflow.label}</DialogTitle>
          <DialogDescription>
            「已连接」需要 Dify App ID 与可解析的 secret_ref 同时具备。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="label">名称</Label>
            <Input id="label" value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="difyAppId">Dify App ID</Label>
            <Input
              id="difyAppId"
              value={difyAppId}
              onChange={(e) => setDifyAppId(e.target.value)}
              placeholder="留空表示清除"
              className="font-mono text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label>应用类型</Label>
            <Select value={appType} onValueChange={(v) => setAppType(v as Workflow["app_type"])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="workflow">workflow</SelectItem>
                <SelectItem value="chatflow">chatflow</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="secretRef">密钥引用（secret_ref）</Label>
            <Input
              id="secretRef"
              value={secretRef}
              onChange={(e) => setSecretRef(e.target.value)}
              placeholder="例如 DIFY_RESEARCH_KEY（留空表示清除）"
              className="font-mono text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label>来源</Label>
            <Select value={secretSource} onValueChange={(v) => setSecretSource(v as SecretSource)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cloudflare_env">cloudflare_env</SelectItem>
                <SelectItem value="supabase_vault">supabase_vault</SelectItem>
              </SelectContent>
            </Select>
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
  const [editing, setEditing] = useState<Workflow | null>(null);

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
      if (r.success) toast.success(`连接成功 · ${r.latencyMs ?? 0}ms`);
      else toast.error(r.message);
      queryClient.invalidateQueries({ queryKey: ["activity"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "测试失败"),
  });

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Workflows</h1>
        <p className="mt-1 text-sm text-muted-foreground">只配置引用与状态；不在此执行 Dify。</p>
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
              <TableHead>启用</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                  加载中…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && workflows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
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
              );
            })}
          </TableBody>
        </Table>
      </div>

      {editing && <WorkflowEditDialog workflow={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
