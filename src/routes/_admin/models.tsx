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
import { listModels, listProviders, updateModel } from "@/lib/admin.functions";
import { CAPABILITY_LABELS, type ModelWithProvider } from "@/lib/control-plane";

export const Route = createFileRoute("/_admin/models")({
  component: ModelsPage,
});

const ALL_CAPABILITIES = ["chat", "reasoning", "vision", "tool_calling"];
const NO_PROVIDER = "__none__";

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
  const { data: providers = [] } = useQuery({
    queryKey: ["providers"],
    queryFn: () => listProviders(),
  });
  const [key, setKey] = useState(model.key);
  const [name, setName] = useState(model.name);
  const [description, setDescription] = useState(model.description);
  const [enabled, setEnabled] = useState(model.enabled);
  const [capabilities, setCapabilities] = useState<string[]>(model.capabilities);
  const [providerKey, setProviderKey] = useState(model.provider_key ?? NO_PROVIDER);

  const mutation = useMutation({
    mutationFn: () =>
      updateModel({
        data: {
          modelId: model.id,
          key,
          name,
          description,
          enabled,
          capabilities,
          providerKey: providerKey === NO_PROVIDER ? null : providerKey,
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
          <DialogTitle>编辑 {model.name}</DialogTitle>
          <DialogDescription>模型是目录条目，不参与实际执行。</DialogDescription>
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
          模型目录，通过 provider_key 归属；当前不参与 Dify 执行。
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>名称</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>能力</TableHead>
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
                    {m.name}
                  </Link>
                  <span className="ml-2 font-mono text-xs text-muted-foreground">{m.key}</span>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {m.provider?.name ?? "—"}
                </TableCell>
                <TableCell>
                  <StatusBadge status={m.status} />
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {m.capabilities.length === 0
                    ? "—"
                    : m.capabilities.map((c) => CAPABILITY_LABELS[c] ?? c).join("、")}
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
