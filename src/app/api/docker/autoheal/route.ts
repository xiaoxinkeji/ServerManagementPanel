import { guardApi } from "@/lib/auth/api";
import { audit } from "@/lib/auth/audit";
import { getAutoHealingStatus, resetCircuitBreaker } from "@/lib/docker/autoheal";

export const dynamic = "force-dynamic";

/**
 * 获取故障自愈与熔断器当前监控状态
 */
export async function GET(request: Request) {
  const guard = await guardApi(request, "docker.view");
  if (!guard.ok) return guard.response;

  const status = getAutoHealingStatus();
  return Response.json({ status });
}

/**
 * 手动重置指定容器的熔断保护状态
 */
export async function POST(request: Request) {
  const guard = await guardApi(request, "docker.action");
  if (!guard.ok) return guard.response;

  try {
    const body = (await request.json()) as { container?: string };
    const container = body.container;
    if (!container || typeof container !== "string") {
      return Response.json({ error: "container name required" }, { status: 400 });
    }

    const reset = resetCircuitBreaker(container);

    audit({
      userId: guard.session.user.id,
      username: guard.session.user.username,
      action: "docker.autoheal.reset",
      targetType: "container",
      targetId: container,
      detail: `手动重置容器故障熔断状态`,
      result: "ok",
    });

    return Response.json({ ok: true, reset });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return Response.json({ error: msg }, { status: 400 });
  }
}
