import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
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
import { createSkill, deleteSkill, listSkills, updateSkill } from "@/lib/admin.functions";
import type { Skill } from "@/lib/control-plane";

export const Route = createFileRoute("/_admin/skills")({
  component: SkillsPage,
});

function SkillDialog({ skill, onClose }: { skill: Skill | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [key, setKey] = useState(skill?.key ?? "");
  const [name, setName] = useState(skill?.name ?? "");
  const [description, setDescription] = useState(skill?.description ?? "");
  const [instructions, setInstructions] = useState(skill?.instructions ?? "");
  const [version, setVersion] = useState(skill?.version ?? "1.0.0");
  const [enabled, setEnabled] = useState(skill?.enabled ?? false);

  const mutation = useMutation({
    mutationFn: async () => {
      if (skill) {
        await updateSkill({
          data: { skillId: skill.id, key, name, description, instructions, version, enabled },
        });
      } else {
        await createSkill({ data: { key, name, description, instructions, version, enabled } });
      }
    },
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
          <DialogTitle>{skill ? `编辑 ${skill.name}` : "新建 Skill"}</DialogTitle>
          <DialogDescription>仅作用于 Direct Model 模式；Dify 路径不加载 Skill。</DialogDescription>
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
              <Label htmlFor="version">版本</Label>
              <Input id="version" value={version} onChange={(e) => setVersion(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="name">名称</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
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
            <Label htmlFor="instructions">Instructions（系统指令）</Label>
            <Textarea
              id="instructions"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={10}
              className="text-sm"
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
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !key.trim() || !name.trim()}
          >
            {mutation.isPending && <Loader2 className="animate-spin" />}
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SkillsPage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Skill | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: skills = [], isLoading } = useQuery({
    queryKey: ["skills"],
    queryFn: () => listSkills(),
  });

  const toggle = useMutation({
    mutationFn: (vars: { skillId: string; enabled: boolean }) => updateSkill({ data: vars }),
    onSuccess: () => {
      toast.success("已更新");
      queryClient.invalidateQueries();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "更新失败"),
  });

  const remove = useMutation({
    mutationFn: (skillId: string) => deleteSkill({ data: { skillId } }),
    onSuccess: () => {
      toast.success("已删除");
      queryClient.invalidateQueries();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "删除失败"),
  });

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Skills</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            可插拔 AI 指令，仅用于 Direct Model 模式。项目在 Navigator 中启用。
          </p>
        </div>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus /> 新建 Skill
        </Button>
      </div>

      <div className="rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>名称</TableHead>
              <TableHead>版本</TableHead>
              <TableHead>启用</TableHead>
              <TableHead className="text-right">操作</TableHead>
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
            {!isLoading && skills.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                  暂无 Skill
                </TableCell>
              </TableRow>
            )}
            {skills.map((s) => (
              <TableRow key={s.id}>
                <TableCell>
                  <span className="font-medium">{s.name}</span>
                  <span className="ml-2 font-mono text-xs text-muted-foreground">{s.key}</span>
                  {s.description ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">{s.description}</p>
                  ) : null}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className="text-[10px]">
                    v{s.version}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Switch
                    checked={s.enabled}
                    disabled={toggle.isPending && toggle.variables?.skillId === s.id}
                    onCheckedChange={(v) => toggle.mutate({ skillId: s.id, enabled: v })}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(s)}>
                      <Pencil />
                      编辑
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => remove.mutate(s.id)}
                      disabled={remove.isPending}
                    >
                      <Trash2 />
                      删除
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {creating && <SkillDialog skill={null} onClose={() => setCreating(false)} />}
      {editing && <SkillDialog skill={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
