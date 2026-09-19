import { serverT } from "@/lib/i18n/runtime";
import { guardApi } from "@/lib/auth/api";
import { getDockerProvider } from "@/lib/providers";
import { diagnoseContainerLogs } from "@/lib/ai/jev-server";

export const dynamic = "force-dynamic";

/**
 * 使用 Jev System One / 智能规则诊断容器状态与近期日志异常
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await guardApi(request, "docker.view");
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const provider = getDockerProvider();

  try {
    const inspect = await provider.inspect(id);
    if (!inspect) {
      return Response.json({ error: serverT("api.notFound.container") }, { status: 404 });
    }

    const containerName = inspect.name.replace(/^\//, "");
    const isExited = inspect.status === "exited" || inspect.status === "dead";
    const exitCode = isExited ? 1 : 0;

    // 读取近期 100 行日志
    const logChunks: string[] = [];
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);

    try {
      for await (const line of provider.logs(id, {
        tail: 100,
        follow: false,
        signal: controller.signal,
      })) {
        logChunks.push(typeof line === "string" ? line : line.text);
      }
    } catch {
      // 忽略日志超时或断开
    } finally {
      clearTimeout(timeout);
    }

    const logs = logChunks.join("\n");
    const diagnosis = await diagnoseContainerLogs(containerName, logs, exitCode);

    return Response.json({
      container: {
        id,
        name: containerName,
        status: inspect.status,
        running: inspect.running,
        health: inspect.health,
      },
      diagnosis,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return Response.json({ error: msg }, { status: 400 });
  }
}
