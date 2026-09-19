import { getBool, getString } from "@/lib/settings";

export interface JevDecisionChoiceRequest {
  type: "choice";
  context: string;
  question: string;
  options: string[];
}

export interface JevDecisionScoreRequest {
  type: "score";
  context: string;
  question: string;
  min?: number;
  max?: number;
}

export interface JevDecisionBooleanRequest {
  type: "boolean" | "noul";
  context: string;
  question: string;
}

export interface JevDecisionResponse {
  answer: string | number | boolean;
  confidence: number;
  reasoning?: string;
  latency_ms: number;
}

export interface ContainerDiagnosisResult {
  category: "database_error" | "config_syntax_error" | "network_timeout" | "oom_killed" | "permission_denied" | "normal_operation" | "unknown";
  category_label: string;
  is_fatal: boolean;
  can_autoheal: boolean;
  confidence: number;
  summary: string;
  recommendation: string;
  source: "jev_ai" | "heuristic_rules";
  latency_ms: number;
}

/**
 * Jev System One Client for fast, typed software decisions.
 */
export async function askJev(
  request: JevDecisionChoiceRequest | JevDecisionScoreRequest | JevDecisionBooleanRequest,
): Promise<JevDecisionResponse | null> {
  const enabled = getBool("ai.jev.enabled");
  const endpoint = getString("ai.jev.endpoint");
  const apiKey = getString("ai.jev.api_key");
  const model = getString("ai.jev.model") || "jev-1";

  if (!enabled || !endpoint || !apiKey) {
    return null;
  }

  const startTime = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000); // 4s timeout for System One fast decision

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "User-Agent": "ServerManagementPanel-Jev/2.1",
      },
      body: JSON.stringify({
        model,
        request,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      console.warn(`[Jev] Request failed with status ${res.status}`);
      return null;
    }

    const data = await res.json();
    const latency_ms = Date.now() - startTime;

    return {
      answer: data.answer ?? data.choice ?? data.score ?? data.result,
      confidence: typeof data.confidence === "number" ? data.confidence : 0.85,
      reasoning: data.reasoning,
      latency_ms,
    };
  } catch (err) {
    console.error("[Jev] Request error:", err);
    return null;
  }
}

/**
 * 启发式故障诊断（当未配置 Jev 或网络离线时的保底规则引擎）
 */
function heuristicDiagnose(logs: string, exitCode?: number): ContainerDiagnosisResult {
  const lowerLogs = logs.toLowerCase();

  if (exitCode === 137 || lowerLogs.includes("out of memory") || lowerLogs.includes("killed") || lowerLogs.includes("oom")) {
    return {
      category: "oom_killed",
      category_label: "内存溢出崩溃 (OOM)",
      is_fatal: true,
      can_autoheal: true,
      confidence: 0.95,
      summary: "容器因内存消耗超出配额限制被 Linux 内核 OOM-Killer 终止。",
      recommendation: "在面板中提高该容器的内存配额限制，或排查内部内存泄漏。",
      source: "heuristic_rules",
      latency_ms: 1,
    };
  }

  if (lowerLogs.includes("econnrefused") || lowerLogs.includes("etimedout") || lowerLogs.includes("connection refused") || lowerLogs.includes("failed to connect")) {
    return {
      category: "network_timeout",
      category_label: "网络与上游连接失败",
      is_fatal: false,
      can_autoheal: true,
      confidence: 0.88,
      summary: "应用尝试连接数据库或外部依赖服务时超时或拒绝连接。",
      recommendation: "检查目标服务（如 MySQL、Redis 等）是否已启动，以及 Docker 网络隔离与端口映射配置。",
      source: "heuristic_rules",
      latency_ms: 1,
    };
  }

  if (lowerLogs.includes("eacces") || lowerLogs.includes("permission denied") || lowerLogs.includes("operation not permitted")) {
    return {
      category: "permission_denied",
      category_label: "权限拒绝 (Permission Denied)",
      is_fatal: true,
      can_autoheal: false,
      confidence: 0.92,
      summary: "容器内进程尝试读取/写入挂载的数据卷或套接字时被宿主机权限策略拦截。",
      recommendation: "检查宿主机挂载目录的属主 UID/GID（使用 chmod/chown 授权），重启可能无法自行解决。",
      source: "heuristic_rules",
      latency_ms: 1,
    };
  }

  if (lowerLogs.includes("syntaxerror") || lowerLogs.includes("invalid configuration") || lowerLogs.includes("unknown flag") || lowerLogs.includes("parse error")) {
    return {
      category: "config_syntax_error",
      category_label: "配置或语法错误",
      is_fatal: true,
      can_autoheal: false,
      confidence: 0.9,
      summary: "配置文件或启动参数存在无法解析的语法错误，程序拒绝启动。",
      recommendation: "检查该容器的挂载配置文件或环境变量定义，纠正格式后再启动。",
      source: "heuristic_rules",
      latency_ms: 1,
    };
  }

  if (lowerLogs.includes("sql") || lowerLogs.includes("database") || lowerLogs.includes("postgres") || lowerLogs.includes("mysql") || lowerLogs.includes("redis")) {
    return {
      category: "database_error",
      category_label: "数据库服务异常",
      is_fatal: false,
      can_autoheal: true,
      confidence: 0.82,
      summary: "日志中出现了数据库相关的查询失败或连接中断异常。",
      recommendation: "检查数据库连接字符串（URL/密码）和健康探针状态。",
      source: "heuristic_rules",
      latency_ms: 1,
    };
  }

  return {
    category: "unknown",
    category_label: "通用未分类异常",
    is_fatal: exitCode !== undefined && exitCode !== 0,
    can_autoheal: true,
    confidence: 0.6,
    summary: "未发现典型已知错误模式，程序退出或持续产生未捕获日志。",
    recommendation: "查看完整的实时日志输出以定位根因。",
    source: "heuristic_rules",
    latency_ms: 1,
  };
}

/**
 * 诊断容器日志并返回分析结果
 */
export async function diagnoseContainerLogs(
  containerName: string,
  logs: string,
  exitCode?: number,
): Promise<ContainerDiagnosisResult> {
  const start = Date.now();
  // 截取日志最后 50 行并限制最大 4000 字符，避免超出 System One token 预算
  const cleanLogs = logs.split("\n").slice(-50).join("\n").slice(-4000);

  // 1. 尝试使用 Jev System One 极速决策模型判断
  const jevResult = await askJev({
    type: "choice",
    context: `Container: ${containerName}\nExitCode: ${exitCode ?? "running"}\nRecent Logs:\n${cleanLogs}`,
    question: "What is the primary cause of error or status in this container?",
    options: [
      "oom_killed",
      "network_timeout",
      "config_syntax_error",
      "permission_denied",
      "database_error",
      "normal_operation",
      "unknown",
    ],
  });

  if (jevResult && typeof jevResult.answer === "string") {
    const category = jevResult.answer as ContainerDiagnosisResult["category"];
    const isFatal = category === "oom_killed" || category === "config_syntax_error" || category === "permission_denied";
    const canAutoheal = category === "oom_killed" || category === "network_timeout" || category === "database_error";

    const labels: Record<string, string> = {
      oom_killed: "内存溢出崩溃 (OOM)",
      network_timeout: "网络与上游连接失败",
      config_syntax_error: "配置或语法错误",
      permission_denied: "权限拒绝 (Permission Denied)",
      database_error: "数据库服务异常",
      normal_operation: "健康运行中",
      unknown: "未知原因",
    };

    return {
      category,
      category_label: labels[category] || category,
      is_fatal: isFatal,
      can_autoheal: canAutoheal,
      confidence: jevResult.confidence,
      summary: jevResult.reasoning || `Jev 决策模型判断主要原因为: ${labels[category] || category}`,
      recommendation: canAutoheal
        ? "该问题通常可通过智能自愈（重启或重试连接）恢复，若频发请调整资源配置。"
        : "该问题通常属于硬性配置或权限阻断，重启可能无法自愈，建议修正配置后手动重试。",
      source: "jev_ai",
      latency_ms: Date.now() - start,
    };
  }

  // 2. Jev 未启用或无法访问时，优雅平滑降级到启发式规则引擎
  return heuristicDiagnose(cleanLogs, exitCode);
}
