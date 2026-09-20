import { guardApi } from "@/lib/auth/api";
import { getDockerProvider } from "@/lib/providers";
import { getBool, getString } from "@/lib/settings";
import { diagnoseContainerLogsCore } from "@/lib/ai/jev";
import { callOpenAiCompatibleLlm, generateHeuristicPrescription } from "@/lib/ai/llm";

export const dynamic = "force-dynamic";

/**
 * 双核深度诊断 API：Jev 毫秒级特征初筛 + 大语言模型专家深度分析处方
 */
export async function POST(request: Request) {
  const guard = await guardApi(request, "docker.view");
  if (!guard.ok) return guard.response;

  try {
    const body = (await request.json()) as { containerId?: string; containerName?: string; logs?: string };
    const containerId = body.containerId;
    if (!containerId || typeof containerId !== "string") {
      return Response.json({ error: "containerId is required" }, { status: 400 });
    }

    const provider = getDockerProvider();
    const inspect = await provider.inspect(containerId);
    if (!inspect) {
      return Response.json({ error: "container not found" }, { status: 404 });
    }

    const name = inspect.name.replace(/^\//, "");
    const exitCode = inspect.status === "exited" ? 1 : 0;

    // 获取近期日志
    let logs = body.logs;
    if (!logs) {
      const chunks: string[] = [];
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 2000);
      try {
        for await (const line of provider.logs(containerId, { tail: 50, follow: false, signal: ctrl.signal })) {
          chunks.push(typeof line === "string" ? line : line.text);
        }
      } catch {
        // 忽略超时
      } finally {
        clearTimeout(t);
      }
      logs = chunks.join("\n");
    }

    // 1. 第一级：Jev 毫秒级极速特征诊断 (System 1)
    const jevMode = (getString("ai.jev.mode") || "builtin") as "builtin" | "remote" | "disabled";
    const jevDiag = await diagnoseContainerLogsCore(name, logs || "", exitCode, {
      mode: jevMode,
      endpoint: getString("ai.jev.endpoint"),
      apiKey: getString("ai.jev.api_key"),
      model: getString("ai.jev.model"),
    });

    // 2. 第二级：LLM 深度大语言模型分析与修复处方 (System 2)
    const llmEnabled = getBool("ai.llm.enabled");
    const llmEndpoint = getString("ai.llm.endpoint");
    const llmApiKey = getString("ai.llm.api_key");
    const llmModel = getString("ai.llm.model") || "deepseek-chat";

    let llmResult = null;
    if (llmEnabled && llmEndpoint && llmApiKey) {
      llmResult = await callOpenAiCompatibleLlm(
        {
          containerName: name,
          jevCategory: jevDiag.category,
          jevConfidence: jevDiag.confidence,
          jevSummary: jevDiag.summary,
          logs: logs || "",
          exitCode,
        },
        {
          enabled: llmEnabled,
          endpoint: llmEndpoint,
          apiKey: llmApiKey,
          model: llmModel,
        },
      );
    }

    // 若未配置外部 LLM 或调用失败，自动降级为内置专家处方生成引擎
    if (!llmResult) {
      llmResult = generateHeuristicPrescription(name, jevDiag.category);
    }

    return Response.json({
      container: {
        id: containerId,
        name,
        status: inspect.status,
        running: inspect.running,
      },
      jev: jevDiag,
      prescription: llmResult,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return Response.json({ error: msg }, { status: 400 });
  }
}
