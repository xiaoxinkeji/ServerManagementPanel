import { sanitizeRemediationCommand } from "./executor.ts";
import type { LlmRuntimeConfig } from "./llm.ts";

export interface TerminalCopilotResult {
  command: string;
  explanation: string;
  safe: boolean;
  model: string;
}

/**
 * 启发式规则库（在未配置大模型或网络离线时提供毫秒级智能翻译）
 */
const HEURISTIC_PATTERNS: { pattern: RegExp; command: string; explanation: string }[] = [
  {
    pattern: /(查看|显示|列出).*(进程|cpu|内存|资源)/i,
    command: "top",
    explanation: "使用 top 动态查看容器内部进程、CPU 与内存资源消耗。",
  },
  {
    pattern: /(查看|显示|列出).*(文件|目录|清单)/i,
    command: "ls -la",
    explanation: "列出当前目录下所有文件与文件夹的详细权限与属性。",
  },
  {
    pattern: /(查看|测试).*(网络|连通|ping|dns)/i,
    command: "ping -c 4 1.1.1.1 || ping -c 4 114.114.114.114",
    explanation: "向公共 DNS 发送 4 次 ICMP 探测包，检测容器外网连通性。",
  },
  {
    pattern: /(查看|显示).*(ip|网卡|路由)/i,
    command: "ip addr || ifconfig",
    explanation: "打印网络接口配置与 IP 地址分配信息。",
  },
  {
    pattern: /(查看|显示).*(磁盘|空间|存储)/i,
    command: "df -h",
    explanation: "以易读的单位 (MB/GB) 显示挂载文件系统与磁盘使用率。",
  },
  {
    pattern: /(清屏|清除屏幕)/i,
    command: "clear",
    explanation: "清除当前终端输出屏幕。",
  },
  {
    pattern: /(查看|当前).*(路径|目录)/i,
    command: "pwd",
    explanation: "显示当前工作目录的完整绝对路径。",
  },
  {
    pattern: /(查看|显示).*(环境变量|env)/i,
    command: "env",
    explanation: "打印当前容器上下文中所有生效的环境变量。",
  },
  {
    pattern: /(查看|显示).*(端口|监听)/i,
    command: "netstat -tuln || ss -tuln",
    explanation: "列出容器内当前正在监听的 TCP/UDP 端口。",
  },
];

/**
 * 将自然语言转为终端 Shell 命令（支持 System 2 大模型与内置专家库）
 */
export async function translateNaturalLanguageToShell(
  prompt: string,
  context?: { containerName?: string; shell?: string },
  llmConfig?: LlmRuntimeConfig | null,
): Promise<TerminalCopilotResult> {
  const query = prompt.trim();
  if (!query) {
    return {
      command: "",
      explanation: "Empty prompt",
      safe: false,
      model: "empty",
    };
  }

  // 1. 尝试大模型转换
  if (llmConfig && llmConfig.enabled && llmConfig.apiKey && llmConfig.endpoint) {
    try {
      const endpoint = `${llmConfig.endpoint.replace(/\/+$/, "")}/chat/completions`;
      const systemPrompt = `You are a strict Linux/Docker terminal AI Copilot.
The user is inside a Docker container named "${context?.containerName || "unknown"}" with shell "${context?.shell || "sh/bash"}".
Convert the user's natural language request into a single, concise, executable shell command.
Output ONLY valid JSON in this structure:
{
  "command": "string (the exact command to run)",
  "explanation": "string (one concise sentence explaining what this command does in Chinese)"
}
Do NOT include markdown backticks or commentary. Only raw JSON.`;

      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${llmConfig.apiKey}`,
        },
        body: JSON.stringify({
          model: llmConfig.model || "deepseek-chat",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: query },
          ],
          temperature: 0.1,
          response_format: { type: "json_object" },
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (res.ok) {
        const json = await res.json();
        const rawContent = json.choices?.[0]?.message?.content?.trim() || "";
        const parsed = JSON.parse(rawContent);
        if (parsed.command) {
          const sanitized = sanitizeRemediationCommand(parsed.command);
          return {
            command: parsed.command,
            explanation: parsed.explanation || "由大语言模型实时生成",
            safe: sanitized.kind !== "blocked",
            model: llmConfig.model || "llm",
          };
        }
      }
    } catch {
      // 优雅回退到内置启发式
    }
  }

  // 2. 启发式精准规则库回退
  for (const item of HEURISTIC_PATTERNS) {
    if (item.pattern.test(query)) {
      return {
        command: item.command,
        explanation: item.explanation,
        safe: true,
        model: "builtin-rules",
      };
    }
  }

  // 3. 通用兜底
  return {
    command: `echo "AI Copilot: ${query.replace(/"/g, '\\"')}"`,
    explanation: "未匹配到具体系统操作指令，安全打印用户意图。",
    safe: true,
    model: "fallback",
  };
}
