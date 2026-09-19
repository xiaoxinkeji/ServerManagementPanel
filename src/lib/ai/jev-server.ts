import { getString } from "@/lib/settings";
import { getDockerProvider } from "@/lib/providers";
import { recordDiagnosis } from "./history";
import {
  askJevCore,
  diagnoseContainerLogsCore,
  type ContainerDiagnosisResult,
  type JevDecisionChoiceRequest,
  type JevDecisionScoreRequest,
  type JevDecisionBooleanRequest,
  type JevDecisionResponse,
} from "./jev";

export async function askJev(
  request: JevDecisionChoiceRequest | JevDecisionScoreRequest | JevDecisionBooleanRequest,
): Promise<JevDecisionResponse> {
  const mode = (getString("ai.jev.mode") || "builtin") as "builtin" | "remote" | "disabled";
  const endpoint = getString("ai.jev.endpoint");
  const apiKey = getString("ai.jev.api_key");
  const model = getString("ai.jev.model") || "jev-1";

  return askJevCore(request, {
    mode,
    endpoint,
    apiKey,
    model,
  });
}

export async function diagnoseContainerLogs(
  containerName: string,
  logs: string,
  exitCode?: number,
): Promise<ContainerDiagnosisResult> {
  const mode = (getString("ai.jev.mode") || "builtin") as "builtin" | "remote" | "disabled";
  const endpoint = getString("ai.jev.endpoint");
  const apiKey = getString("ai.jev.api_key");
  const model = getString("ai.jev.model") || "jev-1";

  return diagnoseContainerLogsCore(containerName, logs, exitCode, {
    mode,
    endpoint,
    apiKey,
    model,
  });
}

/**
 * 按容器 ID 一键 Jev 诊断：inspect + 近 100 行日志 + 写入诊断历史。
 * 找不到容器时返回 null。
 */
export async function diagnoseContainerById(
  id: string,
  trigger: "manual" | "autoheal",
): Promise<{
  container: { id: string; name: string; status: string; running: boolean; health?: string };
  diagnosis: ContainerDiagnosisResult;
} | null> {
  const provider = getDockerProvider();
  const inspect = await provider.inspect(id);
  if (!inspect) return null;

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

  const diagnosis = await diagnoseContainerLogs(containerName, logChunks.join("\n"), exitCode);

  try {
    recordDiagnosis({ containerId: id, containerName, trigger, diagnosis });
  } catch {
    // 历史写入失败不阻断诊断返回
  }

  return {
    container: {
      id,
      name: containerName,
      status: inspect.status,
      running: inspect.running,
      health: inspect.health ?? undefined,
    },
    diagnosis,
  };
}
