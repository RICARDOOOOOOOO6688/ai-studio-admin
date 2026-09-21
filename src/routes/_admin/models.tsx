import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Pencil } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { listModels, updateModel } from "@/lib/admin.functions";
import { CAPABILITY_LABELS, SLOT_LABELS, type ModelWithProvider } from "@/lib/control-plane";

export const Route = createFileRoute("/_admin/models")({
  component: ModelsPage,
});

const ALL_CAPABILITIES = ["chat", "reasoning", "vision", "tool_calling"];
const ALL_SLOTS = ["navigator", "research", "product", "architecture", "build"];

function StatusBadge({ status }: { status: ModelWithProvider["status"] }) {
  if (status === "enabled") {
    return (
      <Badge className="bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/15">已启用</Badge>
    );
  }
  if (status === "provider_unavailable") {
    return (
      <Badge className="bg-amber-500/15 text-amber-600 hover:bg-amber-500/15">
        Provider 不可用
      </Badge>
    );
  }
  return <Badge variant="secondary">已停用</Badge>;
}

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function ModelEditDialog({ model, onClose }: { model: ModelWithProvider; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState(model.display_name);
  const [modelKey, setModelKey] = useState(model.model_key);
  const [upstreamId, setUpstreamId] = useState(model.upstream_id);
  const [description, setDescription] = useState(model.description);
  const [enabled, setEnabled] = useState(model.enabled);
  const [capabilities, setCapabilities] = useState<string[]>(model.capabilities);
  const [slots, setSlots] = useState<string[]>(model.slots);

  const mutation = useMutation({
    mutationFn: () =>
      updateModel({
        data: {
          modelId: model.id,
          displayName,
          modelKey,
          upstreamId,
          description,
          enabled,
          capabilities,
          slots,
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
          <DialogTitle>编辑 {model.display_name}</DialogTitle>
          <DialogDescription>模型归属 Provider，换模型不影响 Provider。</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="displayName">显示名称</Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="modelKey">模型 Key</Label>
              <Input
                id="modelKey"
                value={modelKey}
                onChange={(e) => setModelKey(e.target.value)}
                className="font-mono text-sm"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="upstreamId">模型 ID（Provider 侧）</Label>
            <Input
              id="upstreamId"
              value={upstreamId}
              onChange={(e) => setUpstreamId(e.target.value)}
              className="font-mono text-sm"
            />
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
            <Label>能力</Label>
            <div className="grid grid-cols-2 gap-2">
              {ALL_CAPABILITIES.map((c) => (
                <label key={c} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={capabilities.includes(c)}
                    onCheckedChange={() => setCapabilities((prev) => toggle(prev, c))}
                  />
                  {CAPABILITY_LABELS[c] ?? c}
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>可用于</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {ALL_SLOTS.map((s) => (
                <label key={s} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={slots.includes(s)}
                    onCheckedChange={() => setSlots((prev) => toggle(prev, s))}
                  />
                  {SLOT_LABELS[s] ?? s}
                </label>
              ))}
            </div>
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

function ModelsPage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<ModelWithProvider | null>(null);

  const { data: models = [], isLoading } = useQuery({
    queryKey: ["models"],
    queryFn: () => listModels(),
  });

  const toggleEnabled = useMutation({
    mutationFn: (vars: { modelId: string; enabled: boolean }) => updateModel({ data: vars }),
    onSuccess: () => {
      toast.success("已更新");
      queryClient.invalidateQueries();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "更新失败"),
  });

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Models</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          「已启用」不等于可调用：Provider 未启用或缺密钥时显示为「Provider 不可用」。
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
            {!isLoading && models.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
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
                  <StatusBadge status={m.status} />
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {m.slots.length === 0 ? "—" : m.slots.map((s) => SLOT_LABELS[s] ?? s).join("、")}
                </TableCell>
                <TableCell>
                  <Switch
                    checked={m.enabled}
                    disabled={toggleEnabled.isPending && toggleEnabled.variables?.modelId === m.id}
                    onCheckedChange={(v) => toggleEnabled.mutate({ modelId: m.id, enabled: v })}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => setEditing(m)}>
                    <Pencil />
                    编辑
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {editing && <ModelEditDialog model={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
