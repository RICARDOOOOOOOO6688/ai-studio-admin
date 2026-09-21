import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getAlerts, getCapabilities, getSystemStatus, listActivity } from "@/lib/admin.functions";
import type { HealthState } from "@/lib/control-plane";

export const Route = createFileRoute("/_admin/")({
  component: DashboardPage,
});

const DOT: Record<HealthState, string> = {
  ok: "bg-emerald-500",
  warn: "bg-amber-500",
  down: "bg-destructive",
  unknown: "bg-muted-foreground",
};

function DashboardPage() {
  const { data: status = [] } = useQuery({
    queryKey: ["system-status"],
    queryFn: () => getSystemStatus(),
  });
  const { data: caps } = useQuery({ queryKey: ["capabilities"], queryFn: () => getCapabilities() });
  const { data: activity = [] } = useQuery({
    queryKey: ["activity"],
    queryFn: () => listActivity(),
  });
  const { data: alerts = [] } = useQuery({ queryKey: ["alerts"], queryFn: () => getAlerts() });

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">总览</h1>
        <p className="mt-1 text-sm text-muted-foreground">AI Studio 控制台首页</p>
      </div>

      {/* ① 系统状态 */}
      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">① AI 系统现在正常吗？</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {status.map((item) => (
            <Card key={item.key}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <span className={`size-2.5 rounded-full ${DOT[item.state]}`} />
                  <span className="text-sm font-medium">{item.label}</span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{item.detail}</p>
              </CardContent>
            </Card>
          ))}
          {status.length === 0 && <p className="text-sm text-muted-foreground">加载中…</p>}
        </div>
      </section>

      {/* ② AI 能力 */}
      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">② 现在有哪些 AI 能力？</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Models</CardTitle>
            </CardHeader>
            <CardContent className="flex items-end gap-6">
              <div>
                <p className="text-2xl font-semibold">{caps?.models.configured ?? 0}</p>
                <p className="text-xs text-muted-foreground">已配置</p>
              </div>
              <div>
                <p className="text-2xl font-semibold">{caps?.models.enabled ?? 0}</p>
                <p className="text-xs text-muted-foreground">已启用</p>
              </div>
              <div className="ml-auto text-xs text-muted-foreground">
                共 {caps?.models.total ?? 0} 个
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Workflows</CardTitle>
            </CardHeader>
            <CardContent className="flex items-end gap-6">
              <div>
                <p className="text-2xl font-semibold">{caps?.workflows.total ?? 0}</p>
                <p className="text-xs text-muted-foreground">全部</p>
              </div>
              <div>
                <p className="text-2xl font-semibold">{caps?.workflows.connected ?? 0}</p>
                <p className="text-xs text-muted-foreground">已连接</p>
              </div>
              <div>
                <p className="text-2xl font-semibold">{caps?.workflows.pending ?? 0}</p>
                <p className="text-xs text-muted-foreground">待配置</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ③ 最近发生 */}
        <section>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">③ 最近发生了什么？</h2>
          <Card>
            <CardContent className="p-4">
              {activity.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                  <Clock className="size-5 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">暂无活动记录</p>
                  <p className="text-xs text-muted-foreground">
                    activity_events 表已就绪，等待 Gateway 写入
                  </p>
                </div>
              ) : (
                <ul className="space-y-3">
                  {activity.map((ev) => (
                    <li key={ev.id} className="flex items-start gap-3 text-sm">
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate">{ev.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(ev.created_at).toLocaleString("zh-CN")}
                        </p>
                      </div>
                      <Badge variant="secondary" className="shrink-0 text-[10px]">
                        {ev.type}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>

        {/* ④ 待处理 */}
        <section>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">
            ④ 有没有需要你处理的问题？
          </h2>
          <Card>
            <CardContent className="p-4">
              {alerts.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                  <CheckCircle2 className="size-5 text-emerald-500" />
                  <p className="text-sm text-muted-foreground">暂无待处理问题</p>
                </div>
              ) : (
                <>
                  <div className="mb-3 flex items-center gap-2 text-sm text-amber-600">
                    <AlertTriangle className="size-4" />
                    {alerts.length} 个
                  </div>
                  <ul className="space-y-3">
                    {alerts.map((a, i) => (
                      <li key={i} className="rounded-lg border border-border px-3 py-2">
                        <p className="text-sm font-medium">{a.title}</p>
                        <p className="text-xs text-muted-foreground">{a.detail}</p>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </CardContent>
          </Card>
        </section>
      </div>

      <p className="text-xs text-muted-foreground">
        提示：管理 Provider / Model 请前往{" "}
        <Link to="/providers" className="text-primary hover:underline">
          Providers
        </Link>{" "}
        与{" "}
        <Link to="/models" className="text-primary hover:underline">
          Models
        </Link>
        。
      </p>
    </div>
  );
}
