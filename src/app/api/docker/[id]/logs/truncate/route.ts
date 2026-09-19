import { serverT } from "@/lib/i18n/runtime";
import { guardApi } from "@/lib/auth/api";
import { audit } from "@/lib/auth/audit";
import { getDockerProvider } from "@/lib/providers";

export const dynamic = "force-dynamic";

/**
 * 安全清空/截断容器的 json-file 日志文件（避免日志塞爆服务器磁盘且不破坏容器 stdout 句柄）
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await guardApi(request, "docker.action");
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const provider = getDockerProvider();

  try {
    const raw = (await provider.inspectRaw(id)) as {
      LogPath?: string;
      Name?: string;
    } | null;

    const logPath = raw?.LogPath;
    if (!logPath) {
      return Response.json({ error: serverT("docker.truncate.noLogPath") }, { status: 400 });
    }

    // 动态提取宿主机 Docker 日志所在父目录进行绑定挂载（兼容自定义 data-root 如 /vol2/docker 或 /var/lib/docker）
    const logDir = logPath.substring(0, logPath.lastIndexOf("/"));
    const rootMount = logPath.startsWith("/") ? logDir : "/var/lib/docker";

    // 通过临时特权容器对 logPath 执行安全截断操作 (truncate -s 0 / : > file)
    const result = await provider.runThrowaway({
      image: "alpine:latest",
      cmd: ["sh", "-c", 'if [ -f "$LOG_FILE" ]; then : > "$LOG_FILE"; echo "truncated"; else echo "not_found"; exit 1; fi'],
      binds: [`${rootMount}:${rootMount}`],
      env: { LOG_FILE: logPath },
      namePrefix: "panel-truncate",
      timeoutMs: 30_000,
      user: "0:0",
    });

    if (result.exitCode !== 0) {
      return Response.json({ error: result.output || serverT("docker.truncate.failed") }, { status: 400 });
    }

    audit({
      userId: guard.session.user.id,
      username: guard.session.user.username,
      action: "docker.logs.truncate",
      targetType: "container",
      targetId: id,
      detail: `已清空容器日志文件`,
      result: "ok",
    });

    return Response.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return Response.json({ error: msg }, { status: 400 });
  }
}
