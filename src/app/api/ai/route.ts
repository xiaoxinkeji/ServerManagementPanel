import { guardApi } from "@/lib/auth/api";
import { askJevCore, type JevDecisionChoiceRequest, type JevDecisionScoreRequest, type JevDecisionBooleanRequest } from "@/lib/ai/jev";
import { diagnoseContainerById } from "@/lib/ai/jev-server";
import { listDiagnoses, diagnosisStats } from "@/lib/ai/history";
import { getDockerProvider } from "@/lib/providers";
import { getString } from "@/lib/settings";

export const dynamic = "force-dynamic";

/**
 * Jev 本地规则诊断与可选远程兼容端点工作台 API
 */
export async function GET(request: Request) {
  const guard = await guardApi(request, "panel.view");
  if (!guard.ok) return guard.response;

  const mode = getString("ai.jev.mode") || "builtin";
  const endpoint = getString("ai.jev.endpoint");
  const model = getString("ai.jev.model");

  // 获取正在运行的容器供快速选择诊断
  const provider = getDockerProvider();
  let containers: Array<{ id: string; name: string; status: string }> = [];
  try {
    const list = await provider.list(false);
    containers = list.map((c) => ({
      id: c.id,
      name: c.name.replace(/^\//, ""),
      status: c.status,
    }));
  } catch {
    // 忽略
  }

  return Response.json({
    config: {
      mode,
      endpoint,
      model,
    },
    containers,
    history: listDiagnoses({ limit: 30 }),
    stats: diagnosisStats(),
  });
}

export async function POST(request: Request) {
  let body: {
    action?: "ask" | "diagnose";
    containerId?: string;
    request?: JevDecisionChoiceRequest | JevDecisionScoreRequest | JevDecisionBooleanRequest;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // diagnose 动作涉及容器日志读取，需要 docker.view 权限
  const permission = body.action === "diagnose" ? "docker.view" : "panel.view";
  const guard = await guardApi(request, permission);
  if (!guard.ok) return guard.response;

  try {
    if (body.action === "ask" && body.request) {
      const mode = (getString("ai.jev.mode") || "builtin") as "builtin" | "remote" | "disabled";
      const res = await askJevCore(body.request, {
        mode,
        endpoint: getString("ai.jev.endpoint"),
        apiKey: getString("ai.jev.api_key"),
        model: getString("ai.jev.model"),
      });
      return Response.json({ ok: true, result: res });
    }

    if (body.action === "diagnose" && body.containerId) {
      const result = await diagnoseContainerById(body.containerId, "manual");
      if (!result) {
        return Response.json({ error: "Container not found" }, { status: 404 });
      }
      return Response.json({ ok: true, ...result });
    }

    return Response.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return Response.json({ error: msg }, { status: 400 });
  }
}
