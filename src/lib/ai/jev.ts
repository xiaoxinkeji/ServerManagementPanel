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
  /** 获胜类别命中到的原始日志行（最多 3 条） */
  evidence?: string[];
  /** Choice 模式下各候选选项的 Softmax 概率分布 */
  distribution?: Record<string, number>;
}

export type JevCategory =
  | "oom_killed"
  | "network_timeout"
  | "config_syntax_error"
  | "permission_denied"
  | "database_error"
  | "disk_full"
  | "port_conflict"
  | "missing_dependency"
  | "dns_failure"
  | "auth_failure"
  | "unhealthy"
  | "normal_operation"
  | "unknown";

export interface ContainerDiagnosisResult {
  category: JevCategory;
  category_label: string;
  is_fatal: boolean;
  can_autoheal: boolean;
  confidence: number;
  summary: string;
  recommendation: string;
  source: "builtin_jev" | "remote_jev" | "heuristic_rules";
  latency_ms: number;
  evidence: string[];
}

export interface JevRuntimeConfig {
  mode?: "builtin" | "remote" | "disabled";
  endpoint?: string;
  apiKey?: string;
  model?: string;
}

export interface JevSignature {
  category: JevCategory;
  pattern: RegExp;
  weight: number;
  /** 命中该行时跳过本签名（如 nginx [emerg] 的 no such file 应归配置错误） */
  exclude?: RegExp;
}

/**
 * Jev 故障签名库：逐行匹配 context 日志，命中即累积类别得分。
 */
export const JEV_SIGNATURES: JevSignature[] = [
  {
    category: "oom_killed",
    pattern: /out of memory|oom[- ]?kill|exitcode:\s*137|\bkilled\b/i,
    weight: 4.5,
  },
  {
    category: "network_timeout",
    pattern: /econnrefused|etimedout|connection refused|network is unreachable|connection reset|timed? ?out/i,
    weight: 4.2,
  },
  {
    category: "config_syntax_error",
    pattern: /\[emerg\]/i,
    weight: 4.8,
  },
  {
    category: "config_syntax_error",
    pattern: /syntaxerror|invalid config|unexpected token|parse error|yaml|malformed/i,
    weight: 4.2,
  },
  {
    category: "permission_denied",
    pattern: /eacces|eperm|permission denied|operation not permitted|read-only file system/i,
    weight: 4.2,
  },
  {
    category: "database_error",
    pattern: /sql|mysql|postgres|redis|mongo|database|prisma|sqlite/i,
    weight: 4.0,
  },
  {
    category: "disk_full",
    pattern: /enospc|no space left on device|disk (is )?full|disk quota exceeded/i,
    weight: 4.3,
  },
  {
    category: "port_conflict",
    pattern: /eaddrinuse|address already in use|port is already allocated|bind: address/i,
    weight: 4.3,
  },
  {
    category: "missing_dependency",
    pattern: /cannot find module|module not found|no such file or directory|command not found|exec format error|importerror|modulenotfounderror/i,
    exclude: /\[emerg\]/i,
    weight: 4.2,
  },
  {
    category: "dns_failure",
    pattern: /enotfound|eai_again|could not resolve host|name or service not known|temporary failure in name resolution|no such host/i,
    weight: 4.2,
  },
  {
    category: "auth_failure",
    pattern: /unauthorized|401|403 forbidden|invalid (api )?key|authentication failed|access denied|invalid credentials|password authentication failed/i,
    weight: 4.2,
  },
  {
    category: "unhealthy",
    pattern: /unhealthy|status: exited|status: dead|restarting/i,
    weight: 4.0,
  },
];

/**
 * 类别元数据：中文标签、修复建议、是否致命硬伤、是否可由自愈引擎拉起。
 */
export const JEV_CATEGORY_META: Record<
  JevCategory,
  { label: string; recommendation: string; fatal: boolean; autoheal: boolean }
> = {
  oom_killed: {
    label: "内存溢出崩溃 (OOM)",
    recommendation: "在面板中提高该容器的内存配额限制，或排查内部内存泄漏；故障自愈可临时拉起该容器。",
    fatal: true,
    autoheal: true,
  },
  network_timeout: {
    label: "网络与上游连接失败",
    recommendation: "检查目标服务（如 MySQL/Redis）是否已就绪以及 Docker 网络互通配置，网络抖动自愈引擎可自动恢复。",
    fatal: false,
    autoheal: true,
  },
  config_syntax_error: {
    label: "配置或语法错误",
    recommendation: "配置文件或环境变量存在语法错误，容器自愈重启无法解决硬错误，请修正配置后手动重试。",
    fatal: true,
    autoheal: false,
  },
  permission_denied: {
    label: "权限拒绝 (Permission Denied)",
    recommendation: "挂载数据卷缺少读写权限，需在宿主机执行 chmod/chown 授权，重启无法自行解决。",
    fatal: true,
    autoheal: false,
  },
  database_error: {
    label: "数据库服务异常",
    recommendation: "数据库查询或连接异常，建议检查数据库连接串与账号权限。",
    fatal: false,
    autoheal: true,
  },
  disk_full: {
    label: "磁盘空间耗尽",
    recommendation: "磁盘空间耗尽，建议清理无用镜像与日志文件或扩容数据卷后手动重启。",
    fatal: true,
    autoheal: false,
  },
  port_conflict: {
    label: "端口被占用",
    recommendation: "宿主机端口已被其他进程占用，重启无法解决，请修改端口映射或释放占用端口。",
    fatal: true,
    autoheal: false,
  },
  missing_dependency: {
    label: "缺少依赖或文件",
    recommendation: "容器内缺少运行依赖或关键文件，需修复镜像构建或检查挂载路径，重启无法解决。",
    fatal: true,
    autoheal: false,
  },
  dns_failure: {
    label: "DNS 解析失败",
    recommendation: "域名解析失败，请检查容器 DNS 配置与上游网络；网络恢复后自愈引擎可自动拉起。",
    fatal: false,
    autoheal: true,
  },
  auth_failure: {
    label: "认证或凭据失败",
    recommendation: "认证凭据无效或权限不足，请检查密钥、Token 与账号配置，重启无法解决。",
    fatal: true,
    autoheal: false,
  },
  unhealthy: {
    label: "健康检查失败",
    recommendation: "容器健康检查未通过或处于异常重启中，自愈引擎可尝试重新拉起恢复。",
    fatal: false,
    autoheal: true,
  },
  normal_operation: {
    label: "健康运行中",
    recommendation: "容器状态良好，未发现致命异常崩溃信号。",
    fatal: false,
    autoheal: false,
  },
  unknown: {
    label: "未知原因",
    recommendation: "未匹配到已知特征故障，建议查看完整的容器终端实时日志。",
    fatal: false,
    autoheal: false,
  },
};

const HEALTHY_PATTERN =
  /healthy|status: up|listening on|ready on|exitcode:\s*0|normal operational|started successfully/i;
const EXITED_PATTERN = /exitcode:\s*(?!0\b)\d+|status:\s*(exited|dead)|\bkilled\b/i;
const FATAL_WORD_PATTERN = /fatal|panic|segfault|crash/i;
const DB_WORD_PATTERN = /sql|mysql|postgres|redis|mongo|database|prisma|sqlite/i;
const ERROR_WORD_PATTERN = /error|failed|fail|refused|crash|fatal|panic|denied|exception|traceback/i;

type MatchHit = { score: number; lines: string[] };

/**
 * 逐行扫描 context，返回每个类别的累计得分与命中日志行。
 * 同一类别重复命中时追加递减奖励（weight * 0.15，最多 4 次）。
 */
function matchSignatures(context: string): Map<JevCategory, MatchHit> {
  const hits = new Map<JevCategory, MatchHit>();
  const lines = context.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    for (const sig of JEV_SIGNATURES) {
      if (sig.exclude && sig.exclude.test(line)) continue;
      if (!sig.pattern.test(line)) continue;

      // database_error 需要该行同时出现错误词与数据库词，避免 "sql" 出现在正常日志里误伤
      if (sig.category === "database_error") {
        if (!DB_WORD_PATTERN.test(line) || !ERROR_WORD_PATTERN.test(line)) continue;
      }

      const hit = hits.get(sig.category) ?? { score: 0, lines: [] };
      if (hit.lines.length === 0) {
        hit.score += sig.weight;
      } else {
        const extras = Math.min(hit.lines.length, 4);
        if (extras <= 4) hit.score += sig.weight * 0.15;
      }
      hit.lines.push(trimmed);
      hits.set(sig.category, hit);
    }
  }
  return hits;
}

function pickEvidence(lines: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    const clipped = line.slice(0, 200);
    if (seen.has(clipped)) continue;
    seen.add(clipped);
    out.push(clipped);
    if (out.length >= 3) break;
  }
  return out;
}

function hasErrorHit(hits: Map<JevCategory, MatchHit>, ctx: string): boolean {
  for (const category of hits.keys()) {
    if (category !== "normal_operation") return true;
  }
  return FATAL_WORD_PATTERN.test(ctx);
}

/**
 * 内置极速 Jev 决策模型推理内核 (Builtin System One Kernel)
 */
export function runBuiltinJevDecision(
  request: JevDecisionChoiceRequest | JevDecisionScoreRequest | JevDecisionBooleanRequest,
): JevDecisionResponse {
  const start = Date.now();
  // 只分析上下文内容与日志本身，不要把 question 里的元单词混进故障特征
  const ctx = request.context;
  const hits = matchSignatures(ctx);
  const hasHealthySignal = HEALTHY_PATTERN.test(ctx);
  const isExplicitExited = EXITED_PATTERN.test(ctx);
  const hasFatalHit = [...hits.keys()].some((c) => JEV_CATEGORY_META[c]?.fatal);
  const errorHit = hasErrorHit(hits, ctx);

  // 1. Choice 模式决策
  if (request.type === "choice") {
    const scores = new Map<string, number>();
    for (const opt of request.options) {
      scores.set(opt, 0.05); // 基础平滑概率
    }

    if (scores.has("normal_operation") && hasHealthySignal && !hasFatalHit && !isExplicitExited) {
      scores.set("normal_operation", 5.0);
    }

    // 只有请求里给出的候选类别才参与打分
    for (const [category, hit] of hits.entries()) {
      if (!scores.has(category)) continue;
      scores.set(category, (scores.get(category) || 0) + hit.score);
    }

    // 计算 Softmax / 最大后验概率
    let bestOption = request.options[0] || "unknown";
    let maxScore = -Infinity;
    let sum = 0;

    for (const [opt, s] of scores.entries()) {
      sum += Math.exp(s);
      if (s > maxScore) {
        maxScore = s;
        bestOption = opt;
      }
    }

    const confidence = Math.min(Math.max(Math.exp(maxScore) / (sum || 1), 0.55), 0.99);

    const distribution: Record<string, number> = {};
    for (const [opt, s] of scores.entries()) {
      distribution[opt] = Number((Math.exp(s) / (sum || 1)).toFixed(2));
    }

    const winnerHits = hits.get(bestOption as JevCategory);

    return {
      answer: bestOption,
      confidence: Number(confidence.toFixed(2)),
      reasoning: `内置 Jev 决策内核根据日志语义特征分布匹配最佳选项: ${bestOption}`,
      latency_ms: Math.max(1, Date.now() - start),
      engine: "builtin_jev",
      evidence: winnerHits ? pickEvidence(winnerHits.lines) : [],
      distribution,
    };
  }

  // 2. Score 模式：根据命中类别推算 0-1 严重度分数并映射到 [min, max]
  if (request.type === "score") {
    const min = request.min ?? 0;
    const max = request.max ?? 10;
    let frac: number;
    if (hasFatalHit) frac = 0.9;
    else if (hits.size > 0) frac = 0.6;
    else if (hasHealthySignal) frac = 0.1;
    else frac = 0.3;

    const answer = Math.min(max, Math.max(min, Number((min + frac * (max - min)).toFixed(1))));
    const matched = [...hits.keys()].join(", ") || "none";

    return {
      answer,
      confidence: 0.8,
      reasoning: `内置 Jev 决策内核按匹配到的故障类别 (${matched}) 评估严重度评分: ${answer}`,
      latency_ms: Math.max(1, Date.now() - start),
      engine: "builtin_jev",
      evidence: pickEvidence([...hits.values()].flatMap((h) => h.lines)),
    };
  }

  // 3. Boolean / Noul 模式：依据问题极性返回布尔判定
  const positiveQuestion = /healthy|ok\b|normal|ready|running|alive|fine/i.test(request.question);
  const answer = positiveQuestion ? hasHealthySignal && !errorHit : errorHit;

  return {
    answer,
    confidence: 0.88,
    reasoning: `内置 Jev 决策内核布尔判定: ${answer ? "是" : "否"}`,
    latency_ms: Math.max(1, Date.now() - start),
    engine: "builtin_jev",
    evidence: pickEvidence([...hits.values()].flatMap((h) => h.lines)),
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
      evidence: Array.isArray(data.evidence) ? data.evidence : undefined,
      distribution: data.distribution && typeof data.distribution === "object" ? data.distribution : undefined,
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
      "disk_full",
      "port_conflict",
      "missing_dependency",
      "dns_failure",
      "auth_failure",
      "unhealthy",
      "normal_operation",
      "unknown",
    ],
  }, config);

  const category = (typeof jevResult.answer === "string" ? jevResult.answer : "unknown") as JevCategory;
  const meta = JEV_CATEGORY_META[category] ?? JEV_CATEGORY_META.unknown;

  return {
    category,
    category_label: meta.label,
    is_fatal: meta.fatal,
    can_autoheal: meta.autoheal,
    confidence: jevResult.confidence,
    summary: jevResult.reasoning || `Jev 决策模型判断主要原因为: ${meta.label}`,
    recommendation: meta.recommendation,
    source: jevResult.engine,
    latency_ms: Math.max(1, Date.now() - start),
    evidence: jevResult.evidence ?? [],
  };
}
