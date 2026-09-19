import { serverT } from "@/lib/i18n/runtime";
import { guardApi } from "@/lib/auth/api";
import { audit } from "@/lib/auth/audit";
import { getDockerProvider } from "@/lib/providers";

export const dynamic = "force-dynamic";

/** 预置国内主流可用 Docker 镜像加速站 */
export const PRESET_MIRRORS = [
  { name: "网易 163 镜像源", url: "https://hub-mirror.c.163.com" },
  { name: "中科大 USTC 镜像源", url: "https://docker.mirrors.ustc.edu.cn" },
  { name: "南京大学 NJU 镜像源", url: "https://docker.nju.edu.cn" },
  { name: "上海交大 SJTU 镜像源", url: "https://docker.m.daocloud.io" },
  { name: "DockerProxy 加速源", url: "https://dockerproxy.com" },
  { name: "CF-Workers 常用代理加速", url: "https://docker.cf-workers.net" },
];

function isPrivateOrLocal(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "0.0.0.0" ||
    h === "::1" ||
    h === "[::]" ||
    h === "169.254.169.254" ||
    h === "metadata.google.internal" ||
    h.endsWith(".internal") ||
    h.endsWith(".local")
  ) {
    return true;
  }
  // 拦截常见私网 IP 前缀 (10.x, 172.16-31.x, 192.168.x)
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(h)) {
    return true;
  }
  return false;
}

/**
 * 获取或测试/更新宿主机 Docker 镜像加速源配置 (daemon.json)
 */
export async function GET(request: Request) {
  const guard = await guardApi(request, "docker.view");
  if (!guard.ok) return guard.response;

  const url = new URL(request.url);
  const testUrl = url.searchParams.get("testUrl");

  // 若带 testUrl 参数，测试其连通性与响应时间
  if (testUrl) {
    let parsed: URL;
    try {
      parsed = new URL(testUrl);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        return Response.json({ ok: false, error: "Invalid protocol" }, { status: 400 });
      }
    } catch {
      return Response.json({ ok: false, error: "Invalid URL" }, { status: 400 });
    }

    if (isPrivateOrLocal(parsed.hostname)) {
      return Response.json({ ok: false, error: "Target address forbidden" }, { status: 403 });
    }

    const started = Date.now();
    try {
      const response = await fetch(`${testUrl.replace(/\/+$/, "")}/v2/`, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
        redirect: "manual",
      });
      const durationMs = Date.now() - started;
      // 只要返回 200 或 401(Docker Registry v2 Auth challenge) 均代表源健康连通
      const ok = response.status === 200 || response.status === 401;
      return Response.json({ ok, status: response.status, durationMs });
    } catch {
      return Response.json({ ok: false, durationMs: Date.now() - started });
    }
  }

  // 读取宿主机当前配置的 registry-mirrors
  const provider = getDockerProvider();
  let currentMirrors: string[] = [];

  try {
    const result = await provider.runThrowaway({
      image: "alpine:latest",
      cmd: ["cat", "/etc/docker/daemon.json"],
      binds: ["/etc/docker:/etc/docker:ro"],
      env: {},
      namePrefix: "panel-mirrors-read",
      timeoutMs: 10_000,
      user: "0:0",
    });

    if (result.exitCode === 0 && result.output.trim()) {
      const parsed = JSON.parse(result.output);
      if (Array.isArray(parsed["registry-mirrors"])) {
        currentMirrors = parsed["registry-mirrors"];
      }
    }
  } catch {
    // daemon.json 不存在时为空
  }

  return Response.json({
    presets: PRESET_MIRRORS,
    currentMirrors,
  });
}

export async function POST(request: Request) {
  const guard = await guardApi(request, "docker.action");
  if (!guard.ok) return guard.response;

  let body: { mirrors?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: serverT("api.invalidRequest") }, { status: 400 });
  }

  if (!Array.isArray(body.mirrors)) {
    return Response.json({ error: serverT("api.invalidRequest") }, { status: 400 });
  }

  const cleanMirrors: string[] = [];
  for (const m of body.mirrors) {
    try {
      const parsed = new URL(String(m).trim());
      if ((parsed.protocol === "https:" || parsed.protocol === "http:") && !isPrivateOrLocal(parsed.hostname)) {
        cleanMirrors.push(parsed.origin);
      }
    } catch {
      // 忽略非法 URL
    }
  }

  const provider = getDockerProvider();

  try {
    // 1. 先读取宿主机现有的 daemon.json (保持既有其他配置项不丢失)
    let existingConfig: Record<string, unknown> = {};
    const readResult = await provider.runThrowaway({
      image: "alpine:latest",
      cmd: ["cat", "/etc/docker/daemon.json"],
      binds: ["/etc/docker:/etc/docker:ro"],
      env: {},
      namePrefix: "panel-mirrors-read",
      timeoutMs: 10_000,
      user: "0:0",
    });

    if (readResult.exitCode === 0 && readResult.output.trim()) {
      try {
        existingConfig = JSON.parse(readResult.output);
      } catch {
        existingConfig = {};
      }
    }

    // 2. 在 Node.js 内存中安全合并 JSON 配置，不依赖外部容器工具 (如 jq)
    existingConfig["registry-mirrors"] = cleanMirrors;
    const serializedJson = JSON.stringify(existingConfig, null, 2) + "\n";

    // 3. 将新配置写入宿主机 /etc/docker/daemon.json
    const writeResult = await provider.runThrowaway({
      image: "alpine:latest",
      cmd: [
        "sh",
        "-c",
        'mkdir -p /etc/docker && printf "%s" "$NEW_JSON" > /etc/docker/daemon.json.tmp && mv -f /etc/docker/daemon.json.tmp /etc/docker/daemon.json',
      ],
      binds: ["/etc/docker:/etc/docker"],
      env: { NEW_JSON: serializedJson },
      namePrefix: "panel-mirrors-write",
      timeoutMs: 30_000,
      user: "0:0",
    });

    if (writeResult.exitCode !== 0) {
      return Response.json({ error: writeResult.output || "配置写入失败" }, { status: 400 });
    }

    audit({
      userId: guard.session.user.id,
      username: guard.session.user.username,
      action: "docker.mirrors.update",
      targetType: "system",
      targetId: "daemon.json",
      detail: `更新镜像加速源: ${cleanMirrors.join(", ")}`,
      result: "ok",
    });

    return Response.json({ ok: true, currentMirrors: cleanMirrors });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return Response.json({ error: msg }, { status: 400 });
  }
}
