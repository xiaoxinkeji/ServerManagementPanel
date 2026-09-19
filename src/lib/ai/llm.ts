export interface LlmAnalysisRequest {
  containerName: string;
  jevCategory: string;
  jevConfidence: number;
  jevSummary: string;
  logs: string;
  exitCode?: number;
}

export interface LlmAnalysisResult {
  rootCause: string;
  commands: string[];
  explanation: string;
  prevention: string;
  model: string;
  latency_ms: number;
}

export interface LlmRuntimeConfig {
  enabled: boolean;
  endpoint: string;
  apiKey: string;
  model: string;
}

/**
 * 启发式降级规则生成详细修复处方（当未配置外部 LLM 或网络不可达时使用）
 */
export function generateHeuristicPrescription(
  containerName: string,
  jevCategory: string,
): LlmAnalysisResult {
  const start = Date.now();

  switch (jevCategory) {
    case "oom_killed":
      return {
        rootCause: `容器 ${containerName} 的内存消耗突破了 cgroup 限制，被 Linux 内核 OOM Killer 发送 SIGKILL (137) 强制终止。`,
        commands: [
          `# 1. 查看容器最近内存使用峰值\ndocker stats --no-stream ${containerName}`,
          `# 2. 调大容器内存配额至 1GB (在面板中或使用以下命令热更新)\ndocker update --memory 1024m --memory-swap 2048m ${containerName}`,
          `# 3. 重新拉起容器\ndocker restart ${containerName}`,
        ],
        explanation: "大部分 OOM 事故源自并发突增或内部内存泄漏。在限制容器最大内存的同时，请确保 MemorySwap 设置为合理倍数，避免硬切断。",
        prevention: "在面板中为该容器设置合理的 RAM 预警阈值，或在生产环境中开启面板的智能故障自愈熔断保护。",
        model: "builtin-heuristic-expert",
        latency_ms: Math.max(1, Date.now() - start),
      };

    case "network_timeout":
      return {
        rootCause: `容器内应用在尝试连接上游依赖服务（如数据库或消息队列）时遭遇网络超时 (ETIMEDOUT) 或拒绝连接 (ECONNREFUSED)。`,
        commands: [
          `# 1. 检查目标服务容器是否正在运行\ndocker ps --filter "status=running"`,
          `# 2. 检查两容器是否处于同一 Docker 自定义网络\ndocker inspect ${containerName} --format '{{json .NetworkSettings.Networks}}'`,
          `# 3. 在容器内测试目标端口连通性\ndocker exec -it ${containerName} nc -zv <目标容器名或IP> <端口>`,
        ],
        explanation: "Docker 默认 bridge 网络不支持通过容器名称进行 DNS 服务发现。两个容器必须挂载在同一个自定义网络（如 Compose 默认网络）下才能通过服务名互联。",
        prevention: "检查 Docker Compose 编排文件中的 networks 配置，或在面板容器详情的“网络”标签页中将目标网络附加到此容器。",
        model: "builtin-heuristic-expert",
        latency_ms: Math.max(1, Date.now() - start),
      };

    case "config_syntax_error":
      return {
        rootCause: `应用程序在启动阶段解析挂载的配置文件（YAML/JSON/Conf）或环境变量时抛出无法识别的语法错误，程序主动退出。`,
        commands: [
          `# 1. 校验挂载的配置文件语法\ndocker inspect ${containerName} --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{println}}{{end}}'`,
          `# 2. 检查最后 20 行报错堆栈定位具体行号\ndocker logs --tail 20 ${containerName}`,
        ],
        explanation: "这是不可通过机械重启自愈的硬性配置错误。容器每次重启都会由于相同的语法解析失败立刻退出，自愈引擎已触发保护熔断。",
        prevention: "在宿主机上使用校验工具（如 yamllint 或 jq）检查文件语法，纠正拼写或缩进格式后再手动启动容器。",
        model: "builtin-heuristic-expert",
        latency_ms: Math.max(1, Date.now() - start),
      };

    case "permission_denied":
      return {
        rootCause: `容器内进程（通常已降权为普通 UID 运行）尝试向宿主机挂载的数据卷或套接字读写时，被宿主机文件系统的权限模式拦截。`,
        commands: [
          `# 1. 查找挂载卷的宿主机实际路径\ndocker inspect ${containerName} --format '{{range .Mounts}}{{.Source}}{{println}}{{end}}'`,
          `# 2. 将挂载卷宿主机属主授权给容器内运行用户 (根据容器内用户ID调整，通常为 1000 或 1001)\nsudo chown -R 1000:1000 <宿主机挂载目录路径>`,
          `# 3. 重启容器恢复服务\ndocker restart ${containerName}`,
        ],
        explanation: "容器内的非 root 进程无法修改宿主机属于 root:root 且仅有 0755 权限的目录。赋予正确的属主或读写权限即可彻底解决。",
        prevention: "在部署容器卷时，预先在宿主机上创建好目录并赋予专用非特权用户的属主权限。",
        model: "builtin-heuristic-expert",
        latency_ms: Math.max(1, Date.now() - start),
      };

    default:
      return {
        rootCause: `容器由于未分类的异常行为退出，Jev 判定分类为 ${jevCategory}。`,
        commands: [
          `# 1. 查看完整的退出状态码与最后日志\ndocker inspect ${containerName} --format 'State={{.State.Status}} ExitCode={{.State.ExitCode}}'`,
          `# 2. 实时跟踪输出定位致命错误\ndocker logs --tail 50 -f ${containerName}`,
        ],
        explanation: "应用可能遇到了未捕获的运行时异常（Unhandled Exception）或接收到了外部终止信号。",
        prevention: "在容器实时日志面板中查看详细堆栈以进一步排查代码逻辑问题。",
        model: "builtin-heuristic-expert",
        latency_ms: Math.max(1, Date.now() - start),
      };
  }
}

/**
 * 格式化大模型 System Prompt 与用户问答
 */
const SYSTEM_PROMPT = `You are a Senior Linux & Docker Site Reliability Engineer (SRE).
Your task is to analyze container crash logs and provide a concrete, actionable diagnosis report.
Return ONLY valid JSON matching this schema:
{
  "rootCause": "Clear explanation of why the container failed or is in this state",
  "commands": ["command 1 to run on host", "command 2 to run on host"],
  "explanation": "Detailed technical analysis of the underlying mechanism",
  "prevention": "Best practices to prevent this issue from happening again"
}`;

/**
 * 调用通用 OpenAI 兼容协议大模型生成深度分析方案
 */
export async function callOpenAiCompatibleLlm(
  req: LlmAnalysisRequest,
  config: LlmRuntimeConfig,
): Promise<LlmAnalysisResult | null> {
  if (!config.enabled || !config.endpoint || !config.apiKey) {
    return null;
  }

  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000); // 20s 生产调用超时保护

    const url = config.endpoint.replace(/\/+$/, "") + "/chat/completions";
    const userPrompt = `Container Name: ${req.containerName}
Exit Code: ${req.exitCode ?? "unknown"}
Jev Triage Category: ${req.jevCategory} (Confidence: ${Math.round(req.jevConfidence * 100)}%)
Jev Triage Summary: ${req.jevSummary}

Recent Crash Logs:
\`\`\`
${req.logs.slice(-3000)}
\`\`\`

Please diagnose this container crash and provide the exact host remediation commands.`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
        "User-Agent": "ServerManagementPanel-DualAI/2.1",
      },
      body: JSON.stringify({
        model: config.model || "deepseek-chat",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      console.warn(`[LLM] API call failed with HTTP ${res.status}`);
      return null;
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content);
    return {
      rootCause: String(parsed.rootCause || "未知根本原因"),
      commands: Array.isArray(parsed.commands) ? parsed.commands.map(String) : [],
      explanation: String(parsed.explanation || ""),
      prevention: String(parsed.prevention || ""),
      model: config.model || "llm-expert",
      latency_ms: Date.now() - start,
    };
  } catch (err) {
    console.error("[LLM] Deep analysis request error:", err);
    return null;
  }
}
