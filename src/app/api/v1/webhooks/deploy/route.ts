import { getDockerProvider } from "@/lib/providers";
import { audit } from "@/lib/auth/audit";
import { safeEquals } from "@/lib/crypto";
import { getString, getBool } from "@/lib/settings";
import { panelContainerName, resolveCaddyContainerName } from "@/lib/host/self";
import { updateContainerImage } from "@/lib/docker/update";

export const dynamic = "force-dynamic";

/**
 * 外部自动化触发器 (Webhook Trigger for CI/CD & Deploy)
 * 允许外部 CI/CD (如 GitHub Actions, GitLab, Gitea) 或脚本通过安全的 Token 触发容器更新或服务拉取重启。
 *
 * 安全设计:
 * 1. 恒定时间比对防御 Timing Attack (safeEquals 已经哈希固定 32 字节)；
 * 2. 严禁重命名或重拉起面板自身及 Caddy 反代容器；
 * 3. 严格验证 target 与容器名格式，防止注入；
 * 4. 真正调用 updateContainerImage 执行新镜像部署与平滑过渡，若仅重启则执行安全的 restart。
 */
export async function POST(request: Request) {
  const enabled = getBool("docker.webhook_deploy.enabled");
  if (!enabled) {
    return Response.json({ error: "Webhook deploy trigger is disabled" }, { status: 403 });
  }

  const configuredToken = getString("docker.webhook_deploy.token").trim();
  if (!configuredToken) {
    return Response.json({ error: "No webhook deploy token configured" }, { status: 403 });
  }

  const providedToken =
    request.headers.get("x-deploy-token") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";

  if (!providedToken || !safeEquals(providedToken.trim(), configuredToken)) {
    return Response.json({ error: "Unauthorized: invalid deploy token" }, { status: 401 });
  }

  let body: { target?: unknown; name?: unknown; pull?: unknown };
  try {
    const raw = await request.json();
    if (!raw || typeof raw !== "object") {
      return Response.json({ error: "Invalid JSON object" }, { status: 400 });
    }
    body = raw as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const target = String(body.target ?? "container");
  const name = String(body.name ?? "").trim();
  const pull = body.pull !== false;

  if (!name || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]+$/.test(name)) {
    return Response.json({ error: "Valid target name required" }, { status: 400 });
  }

  // 关键安全门禁：禁止外部 Webhook 对面板本体或 Caddy 反代进行触发重启/替换
  const own = panelContainerName();
  const caddy = await resolveCaddyContainerName(getString("proxy.caddy_container"));
  if (name === own || name === caddy) {
    return Response.json({ error: "Protected container cannot be targeted via webhook" }, { status: 403 });
  }

  const provider = getDockerProvider();

  try {
    if (target === "container") {
      const inspect = await provider.inspect(name);
      if (!inspect) {
        return Response.json({ error: `Container '${name}' not found` }, { status: 404 });
      }

      if (pull) {
        // 使用标准的 updateContainerImage 流程（停止、以新镜像创建、迁移网络和卷）
        const updateResult = await updateContainerImage(name);
        audit({
          username: "webhook-deploy",
          action: "docker.webhook.deploy",
          targetType: "container",
          targetId: name,
          detail: `通过 Webhook 自动化部署更新镜像 (${updateResult.changed ? "已更新至新镜像" : "镜像未改变"})`,
          result: updateResult.changed ? "ok" : "ok",
        });

        return Response.json({
          ok: true,
          target: "container",
          name,
          updated: updateResult.changed,
          steps: updateResult.steps,
        });
      }

      // 仅需平滑重启
      await provider.action(name, "restart", 15);

      audit({
        username: "webhook-deploy",
        action: "docker.webhook.deploy",
        targetType: "container",
        targetId: name,
        detail: `通过 Webhook 触发容器平滑重启`,
        result: "ok",
      });

      return Response.json({ ok: true, target: "container", name, restarted: true });
    }

    return Response.json({ error: `Unsupported target '${target}'` }, { status: 400 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    audit({
      username: "webhook-deploy",
      action: "docker.webhook.deploy",
      targetType: target,
      targetId: name,
      detail: `Webhook 部署执行失败: ${msg}`,
      result: "error",
    });
    return Response.json({ error: msg }, { status: 500 });
  }
}
