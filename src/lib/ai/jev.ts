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
  engine: "builtin_jev" | "remote_jev" | "heuristic_rules";
}

export interface ContainerDiagnosisResult {
  category: "database_error" | "config_syntax_error" | "network_timeout" | "oom_killed" | "permission_denied" | "normal_operation" | "unknown";
  category_label: string;
  is_fatal: boolean;
  can_autoheal: boolean;
  confidence: number;
  summary: string;
  recommendation: string;
  source: "builtin_jev" | "remote_jev" | "heuristic_rules";
  latency_ms: number;
}

export interface JevRuntimeConfig {
  mode?: "builtin" | "remote" | "disabled";
  endpoint?: string;
  apiKey?: string;
  model?: string;
}

/**
 * 内置极速 Jev 决策模型推理内核 (Builtin System One Kernel)
 */
export function runBuiltinJevDecision(
  request: JevDecisionChoiceRequest | JevDecisionScoreRequest | JevDecisionBooleanRequest,
): JevDecisionResponse {
  const start = Date.now();
  // 只分析上下文内容与用户问题意图，不要把 question 里的元单词混进故障特征
  const ctx = request.context.toLowerCase();
  const q = request.question.toLowerCase();
  const fullText = (ctx + " " + q);

  // 1. Choice 模式决策
  if (request.type === "choice") {
    const scores = new Map<string, number>();
    for (const opt of request.options) {
      scores.set(opt, 0.05); // 基础平滑概率
    }

    // A. 错误信号检测（仅基于 Context 日志本身，避免 Question 包含 error 导致误伤）
    const hasLogFatal = ctx.includes("fatal") || ctx.includes("panic") || ctx.includes("syntaxerror") || ctx.includes("out of memory");
    const hasLogError = ctx.includes("error") || ctx.includes("failed") || ctx.includes("refused") || ctx.includes("crash");
    const isExplicitExited = ctx.includes("exitcode: 137") || ctx.includes("exitcode: 1") || ctx.includes("killed") || ctx.includes("status: exited");

    // B. 健康信号检测
    const hasHealthySignal = ctx.includes("healthy") || ctx.includes("status: up") || ctx.includes("listening on") || ctx.includes("ready on") || ctx.includes("exitcode: 0") || ctx.includes("normal operational");

    if (scores.has("normal_operation") && hasHealthySignal && !hasLogFatal && !isExplicitExited) {
      scores.set("normal_operation", 5.0);
    } else {
      // 故障特征先验匹配
      if (ctx.includes("oom") || ctx.includes("out of memory") || ctx.includes("killed") || ctx.includes("exitcode: 137")) {
        scores.set("oom_killed", (scores.get("oom_killed") || 0) + 4.5);
      }
      if (ctx.includes("econnrefused") || ctx.includes("etimedout") || ctx.includes("connection refused") || ctx.includes("network is unreachable")) {
        scores.set("network_timeout", (scores.get("network_timeout") || 0) + 4.2);
      }
      if (ctx.includes("syntaxerror") || ctx.includes("invalid config") || ctx.includes("unexpected token") || ctx.includes("parse error")) {
        scores.set("config_syntax_error", (scores.get("config_syntax_error") || 0) + 4.2);
      }
      if (ctx.includes("eacces") || ctx.includes("permission denied") || ctx.includes("operation not permitted")) {
        scores.set("permission_denied", (scores.get("permission_denied") || 0) + 4.2);
      }
      if ((hasLogError || hasLogFatal) && (ctx.includes("sql") || ctx.includes("mysql") || ctx.includes("postgres") || ctx.includes("redis") || ctx.includes("database") || ctx.includes("prisma"))) {
        scores.set("database_error", (scores.get("database_error") || 0) + 4.0);
      }
      if (scores.has("unhealthy") && (ctx.includes("unhealthy") || ctx.includes("exited") || ctx.includes("dead"))) {
        scores.set("unhealthy", (scores.get("unhealthy") || 0) + 4.2);
      }
    }

    // 计算 Softmax / 最大后验概率
    let bestOption = request.options[0] || "unknown";
    let maxScore = -1;
    let sum = 0;

    for (const [opt, s] of scores.entries()) {
      sum += Math.exp(s);
      if (s > maxScore) {
        maxScore = s;
        bestOption = opt;
      }
    }

    const confidence = Math.min(Math.max(Math.exp(maxScore) / (sum || 1), 0.55), 0.99);

    return {
      answer: bestOption,
      confidence: Number(confidence.toFixed(2)),
      reasoning: `内置 Jev 决策内核根据日志语义特征分布匹配最佳选项: ${bestOption}`,
      latency_ms: Math.max(1, Date.now() - start),
      engine: "builtin_jev",
    };
  }

  // 2. Score / Boolean 模式
  return {
    answer: fullText.includes("fail") || fullText.includes("error") || fullText.includes("killed"),
    confidence: 0.88,
    latency_ms: Math.max(1, Date.now() - start),
    engine: "builtin_jev",
  };
}

/**
 * 远程 Jev System One 服务调用
 */
export async function callRemoteJev(
  request: JevDecisionChoiceRequest | JevDecisionScoreRequest | JevDecisionBooleanRequest,
  endpoint: string,
  apiKey: string,
  model: string,
): Promise<JevDecisionResponse | null> {
  const startTime = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

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
      return null;
    }

    const data = await res.json();
    return {
      answer: data.answer ?? data.choice ?? data.score ?? data.result,
      confidence: typeof data.confidence === "number" ? data.confidence : 0.85,
      reasoning: data.reasoning,
      latency_ms: Date.now() - startTime,
      engine: "remote_jev",
    };
  } catch {
    return null;
  }
}

/**
 * Jev 决策分发（纯逻辑，解耦 I/O 配置）
 */
export async function askJevCore(
  request: JevDecisionChoiceRequest | JevDecisionScoreRequest | JevDecisionBooleanRequest,
  config: JevRuntimeConfig = { mode: "builtin" },
): Promise<JevDecisionResponse> {
  const mode = config.mode || "builtin";

  if (mode === "disabled") {
    return {
      answer: "unknown",
      confidence: 0.5,
      latency_ms: 1,
      engine: "heuristic_rules",
    };
  }

  if (mode === "remote" && config.endpoint && config.apiKey) {
    const remoteRes = await callRemoteJev(request, config.endpoint, config.apiKey, config.model || "jev-1");
    if (remoteRes) return remoteRes;
  }

  return runBuiltinJevDecision(request);
}

/**
 * 诊断容器日志核心逻辑
 */
export async function diagnoseContainerLogsCore(
  containerName: string,
  logs: string,
  exitCode?: number,
  config: JevRuntimeConfig = { mode: "builtin" },
): Promise<ContainerDiagnosisResult> {
  const start = Date.now();
  const cleanLogs = logs.split("\n").slice(-50).join("\n").slice(-4000);

  const jevResult = await askJevCore({
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
  }, config);

  const category = (typeof jevResult.answer === "string" ? jevResult.answer : "unknown") as ContainerDiagnosisResult["category"];
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

  const recs: Record<string, string> = {
    oom_killed: "在面板中提高该容器的内存配额限制，或排查内部内存泄漏；故障自愈可临时拉起该容器。",
    network_timeout: "检查目标服务（如 MySQL/Redis）是否已就绪以及 Docker 网络互通配置，网络抖动自愈引擎可自动恢复。",
    config_syntax_error: "配置文件或环境变量存在语法错误，容器自愈重启无法解决硬错误，请修正配置后手动重试。",
    permission_denied: "挂载数据卷缺少读写权限，需在宿主机执行 chmod/chown 授权，重启无法自行解决。",
    database_error: "数据库查询或连接异常，建议检查数据库连接串与账号权限。",
    normal_operation: "容器状态良好，未发现致命异常崩溃信号。",
    unknown: "未匹配到已知特征故障，建议查看完整的容器终端实时日志。",
  };

  return {
    category,
    category_label: labels[category] || category,
    is_fatal: isFatal,
    can_autoheal: canAutoheal,
    confidence: jevResult.confidence,
    summary: jevResult.reasoning || `Jev 决策模型判断主要原因为: ${labels[category] || category}`,
    recommendation: recs[category] || recs.unknown,
    source: jevResult.engine,
    latency_ms: Math.max(1, Date.now() - start),
  };
}
