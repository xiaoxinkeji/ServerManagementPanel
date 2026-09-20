import { serverT } from "@/lib/i18n/runtime";
import { guardApi } from "@/lib/auth/api";
import { getBool, getString } from "@/lib/settings";
import { translateNaturalLanguageToShell } from "@/lib/ai/copilot";

export const dynamic = "force-dynamic";

/**
 * Web 终端 AI Copilot 语义翻译接口 (POST /api/ai/copilot)
 */
export async function POST(request: Request) {
  const guard = await guardApi(request, "docker.view");
  if (!guard.ok) return guard.response;

  try {
    const body = (await request.json()) as {
      prompt?: string;
      containerName?: string;
      shell?: string;
    };

    const prompt = body.prompt?.trim();
    if (!prompt) {
      return Response.json({ error: serverT("api.invalidRequest") }, { status: 400 });
    }

    const llmEnabled = getBool("ai.llm.enabled");
    const llmEndpoint = getString("ai.llm.endpoint");
    const llmApiKey = getString("ai.llm.api_key");
    const llmModel = getString("ai.llm.model") || "deepseek-chat";

    const result = await translateNaturalLanguageToShell(
      prompt,
      {
        containerName: body.containerName,
        shell: body.shell,
      },
      llmEnabled && llmEndpoint && llmApiKey
        ? {
            enabled: true,
            endpoint: llmEndpoint,
            apiKey: llmApiKey,
            model: llmModel,
          }
        : null,
    );

    return Response.json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return Response.json({ error: msg }, { status: 500 });
  }
}
