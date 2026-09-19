import { getString } from "@/lib/settings";
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
