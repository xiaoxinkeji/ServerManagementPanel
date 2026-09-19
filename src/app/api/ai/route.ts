import { guardApi } from "@/lib/auth/api";
import { askJevCore, type JevDecisionChoiceRequest, type JevDecisionScoreRequest, type JevDecisionBooleanRequest } from "@/lib/ai/jev";
import { getDockerProvider } from "@/lib/providers";
import { getString } from "@/lib/settings";

export const dynamic = "force-dynamic";

/**
 * Jev System One 独立决策与智能工作台 API
 */
export async function GET(request: Request) {
  const guard = await guardApi(request, "panel.view");
  if (!guard.ok) return guard.response;

  const mode = getString("ai.jev.mode") || "builtin";
  const endpoint = getString("ai.jev.endpoint");
  const model = getString("ai.jev.model") || "jev-1";

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
  });
}

export async function POST(request: Request) {
  const guard = await guardApi(request, "panel.view");
  if (!guard.ok) return guard.response;

  try {
    const body = (await request.json()) as {
      action?: "ask" | "diagnose";
      request?: JevDecisionChoiceRequest | JevDecisionScoreRequest | JevDecisionBooleanRequest;
    };

    if (body.action === "ask" && body.request) {
      const mode = (getString("ai.jev.mode") || "builtin") as "builtin" | "remote" | "disabled";
      const res = await askJevCore(body.request, {
        mode,
        endpoint: getString("ai.jev.endpoint"),
        apiKey: getString("ai.jev.api_key"),
        model: getString("ai.jev.model") || "jev-1",
      });
      return Response.json({ ok: true, result: res });
    }

    return Response.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return Response.json({ error: msg }, { status: 400 });
  }
}
