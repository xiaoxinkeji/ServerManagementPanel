import { serverT } from "@/lib/i18n/runtime";
import { guardApi } from "@/lib/auth/api";
import { audit } from "@/lib/auth/audit";
import { getDockerProvider } from "@/lib/providers";
import { resetCircuitBreaker } from "@/lib/docker/autoheal";
import { sanitizeRemediationCommand, parseMemoryStringToBytes } from "@/lib/ai/executor";

export const dynamic = "force-dynamic";

/**
 * 授权 AI 执行故障自动修愈 (Auto-Remediate)
 */
export async function POST(request: Request) {
  const guard = await guardApi(request, "docker.action");
  if (!guard.ok) return guard.response;

  try {
    const body = (await request.json()) as { container?: string; command?: string };
    const container = body.container?.trim();
    const command = body.command?.trim();

    if (!container || !command) {
      return Response.json({ error: serverT("api.invalidRequest") }, { status: 400 });
    }

    // 1. 安全沙箱审查
    const sanitizeResult = sanitizeRemediationCommand(command);
    if (!sanitizeResult.safe) {
      return Response.json(
        {
          error: "Command blocked by security sandbox",
          reason: sanitizeResult.reason,
          command,
        },
        { status: 403 },
      );
    }

    const provider = getDockerProvider();
    const inspect = await provider.inspect(container);
    if (!inspect) {
      return Response.json({ error: serverT("api.notFound.container") }, { status: 404 });
    }

    let actionExecuted = "";

    // 2. 根据安全白名单指令类型执行受控运维操作
    if (sanitizeResult.kind === "docker_update") {
      const memoryStr = sanitizeResult.args?.memory as string;
      const memBytes = memoryStr ? parseMemoryStringToBytes(memoryStr) : undefined;

      await provider.updateResources(container, {
        memoryBytes: memBytes ?? undefined,
      });
      actionExecuted = `Updated memory to ${memoryStr}`;
    } else if (sanitizeResult.kind === "docker_restart") {
      await provider.action(container, "restart", 10);
      actionExecuted = "Restarted container";
    } else if (sanitizeResult.kind === "docker_prune") {
      await provider.prune("images-unused");
      actionExecuted = "Pruned unused images";
    }

    // 3. 修复成功后自动解开故障自愈熔断保护
    resetCircuitBreaker(container);

    // 4. 记录高可信审计日志
    audit({
      userId: guard.session.user.id,
      username: guard.session.user.username,
      action: "docker.ai.remediate",
      targetType: "container",
      targetId: container,
      detail: `AI 授权一键修愈执行成功 [${sanitizeResult.kind}]: ${command} -> ${actionExecuted}`,
      result: "ok",
    });

    return Response.json({
      ok: true,
      command,
      actionExecuted,
      container,
      unlockedCircuitBreaker: true,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return Response.json({ error: msg }, { status: 400 });
  }
}
