export interface SanitizedRemediationCommand {
  raw: string;
  kind: "docker_update" | "docker_restart" | "docker_prune" | "docker_stats" | "docker_logs" | "blocked";
  safe: boolean;
  args?: Record<string, unknown>;
  reason?: string;
}

/**
 * 危险模式正则阻断（防提权逃逸、防删除根目录、防破坏性写入）
 */
const BLOCKED_PATTERNS = [
  /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*\s+|\s+.*\/)([\*\/\s]|$)/i, // rm -rf / 或类似
  /\b(mkfs|dd|fdisk|parted)\b/i,
  /\bchmod\s+777\b/i,
  /\b(curl|wget).*\|\s*(ba)?sh\b/i, // 管道执行远程脚本
  />\s*\/dev\/(sd[a-z]|nvme|null|zero|mem)/i,
  /\b(reboot|shutdown|poweroff|init\s+0)\b/i,
];

/**
 * 命令安全过滤器与参数结构化解析器
 */
export function sanitizeRemediationCommand(cmd: string): SanitizedRemediationCommand {
  const trimmed = cmd.trim();

  // 1. 过滤空行与注释行
  if (!trimmed || trimmed.startsWith("#")) {
    return { raw: trimmed, kind: "blocked", safe: false, reason: "comment_or_empty" };
  }

  // 2. 严厉特征黑名单拦截
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        raw: trimmed,
        kind: "blocked",
        safe: false,
        reason: "matched_dangerous_pattern",
      };
    }
  }

  // 3. 安全白名单行为精准匹配

  // A. docker update (内存配额调整)
  const updateMatch = /^docker\s+update\s+--memory\s+(\d+[mMgG])(\s+--memory-swap\s+(\d+[mMgG]))?\s+([a-zA-Z0-9_\.\-]+)$/.exec(trimmed);
  if (updateMatch) {
    return {
      raw: trimmed,
      kind: "docker_update",
      safe: true,
      args: {
        memory: updateMatch[1],
        memorySwap: updateMatch[3],
        container: updateMatch[4],
      },
    };
  }

  // B. docker restart
  const restartMatch = /^docker\s+restart\s+([a-zA-Z0-9_\.\-]+)$/.exec(trimmed);
  if (restartMatch) {
    return {
      raw: trimmed,
      kind: "docker_restart",
      safe: true,
      args: {
        container: restartMatch[1],
      },
    };
  }

  // C. docker system prune
  if (/^docker\s+system\s+prune(\s+-f)?$/.test(trimmed)) {
    return {
      raw: trimmed,
      kind: "docker_prune",
      safe: true,
    };
  }

  // D. 查询类指令 (只读安全)
  if (/^docker\s+(logs|stats|inspect|ps)\b/.test(trimmed)) {
    return {
      raw: trimmed,
      kind: "docker_logs",
      safe: true,
    };
  }

  return {
    raw: trimmed,
    kind: "blocked",
    safe: false,
    reason: "not_in_safe_whitelist",
  };
}

/**
 * 转换内存字符串为字节数
 */
export function parseMemoryStringToBytes(str: string): number | null {
  const m = /^(\d+)([mMgG])$/.exec(str.trim());
  if (!m) return null;
  const val = parseInt(m[1], 10);
  const unit = m[2].toLowerCase();
  if (unit === "m") return val * 1024 * 1024;
  if (unit === "g") return val * 1024 * 1024 * 1024;
  return null;
}
