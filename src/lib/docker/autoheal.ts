import "server-only";

import { getDockerProvider } from "@/lib/providers";
import { getBool, getNumber, getString } from "@/lib/settings";
import { announce } from "@/lib/alerts/announce";
import { audit } from "@/lib/auth/audit";
import { panelContainerName } from "@/lib/host/self";
import { diagnoseContainerLogsCore } from "@/lib/ai/jev";
import { recordDiagnosis } from "@/lib/ai/history";

/**
 * 智能故障自愈与熔断引擎 (Auto-Healing Engine)
 *
 * 核心设计:
 * 1. 自动重启: 针对意外崩溃 (OOM 或异常退出码) 的关键容器，在设定的重试窗口内自动执行拉起；
 * 2. 故障熔断: 容器如果在短时间窗口内反复崩溃 (超过 retry_max 次数)，自动熔断暂停拉起，发送严重告警，避免持续死循环占用 CPU；
 * 3. 并发锁与 TTL 清理: 避免同一 OOM 触发双重重启，定期清理过期跟踪记录防止内存泄漏。
 */

type ContainerCrashRecord = {
  count: number;
  firstCrashAt: number;
  lastCrashAt: number;
  tripped: boolean; // 是否处于熔断状态
  restarting?: boolean; // 并发锁，防止重复并发重启
};

const crashTracker = new Map<string, ContainerCrashRecord>();
let lastCleanAt = Date.now();

function sweepOldRecords(now: number, windowMs: number) {
  if (now - lastCleanAt < 60_000) return;
  lastCleanAt = now;
  for (const [name, rec] of crashTracker.entries()) {
    if (!rec.tripped && now - rec.lastCrashAt > windowMs * 2) {
      crashTracker.delete(name);
    }
  }
}

export function getAutoHealingStatus(): Array<{
  container: string;
  crashCount: number;
  tripped: boolean;
  lastCrashAt: number;
}> {
  return [...crashTracker.entries()].map(([container, record]) => ({
    container,
    crashCount: record.count,
    tripped: record.tripped,
    lastCrashAt: record.lastCrashAt,
  }));
}

export function resetCircuitBreaker(containerName: string): boolean {
  return crashTracker.delete(containerName);
}

/**
 * 处理容器崩溃事件，执行自动恢复或触发熔断
 */
export async function handleContainerCrash(
  containerId: string,
  containerName: string,
  reason: "oom" | "die",
  exitCode?: number,
): Promise<void> {
  const enabled = getBool("docker.autoheal.enabled");
  if (!enabled) return;

  // 绝不处理面板自身或反向代理网关
  const own = panelContainerName();
  if (
    !containerName ||
    containerName === own ||
    (own.length >= 12 && containerId.startsWith(own)) ||
    (containerId.length >= 12 && own.startsWith(containerId))
  ) {
    return;
  }

  const now = Date.now();
  const windowMs = getNumber("docker.autoheal.window_minutes") * 60_000;
  const maxRetries = getNumber("docker.autoheal.max_retries");

  sweepOldRecords(now, windowMs);

  let record = crashTracker.get(containerName);

  // 并发防护：如果该容器已经在重启处理中，忽略并发事件
  if (record?.restarting) {
    return;
  }

  // OOM 事件发生后往往紧跟 die 事件 (137)，如果 5 秒内已有相同记录则避免重复叠加
  if (record && reason === "die" && exitCode === 137 && now - record.lastCrashAt < 5000) {
    return;
  }

  if (!record || now - record.firstCrashAt > windowMs) {
    record = {
      count: 1,
      firstCrashAt: now,
      lastCrashAt: now,
      tripped: false,
      restarting: false,
    };
    crashTracker.set(containerName, record);
  } else {
    record.count += 1;
    record.lastCrashAt = now;
  }

  // 1. 检查是否触发熔断
  if (record.count > maxRetries) {
    if (!record.tripped) {
      record.tripped = true;
      // 触发严重熔断告警
      await announce({
        alertKey: `autoheal:circuit_breaker:${containerName}`,
        source: "docker",
        severity: "critical",
        title: `容器 ${containerName} 故障熔断`,
        detail: `容器在 ${Math.round(windowMs / 60_000)} 分钟内连续异常崩溃 ${record.count} 次 (退出码: ${exitCode ?? "未知"})，自愈引擎已触发熔断保护并停止自动重启，请登录排查日志。`,
      }).catch(console.error);

      audit({
        username: "autoheal",
        action: "docker.autoheal.circuit_breaker",
        targetType: "container",
        targetId: containerName,
        detail: `触发熔断，已停止尝试重启 (连续崩溃 ${record.count} 次)`,
        result: "error",
      });
    }
    return;
  }

  // 2. 检查 Jev AI 智能守卫：如果是不可自愈的严重语法/权限硬伤，直接智能熔断避免盲目拉起
  const jevMode = getString("ai.jev.mode") || "builtin";
  let jevAdvice = "";
  if (jevMode !== "disabled") {
    try {
      const provider = getDockerProvider();
      const logChunks: string[] = [];
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 1500);
      for await (const line of provider.logs(containerId, { tail: 30, follow: false, signal: ctrl.signal })) {
        logChunks.push(typeof line === "string" ? line : line.text);
      }
      clearTimeout(t);
      const diag = await diagnoseContainerLogsCore(containerName, logChunks.join("\n"), exitCode, {
        mode: jevMode as "builtin" | "remote" | "disabled",
        endpoint: getString("ai.jev.endpoint"),
        apiKey: getString("ai.jev.api_key"),
        model: getString("ai.jev.model") || "jev-1",
      });

      try {
        recordDiagnosis({
          containerId,
          containerName,
          trigger: "autoheal",
          diagnosis: diag,
        });
      } catch (e) {
        console.error("[autoheal] recordDiagnosis failed", e);
      }

      if (diag.is_fatal && !diag.can_autoheal && diag.confidence >= 0.85) {
        // Jev 判断属于硬性致命错误（如配置文件语法错误、权限拒绝），自愈无意义，执行智能熔断
        record.tripped = true;
        await announce({
          alertKey: `autoheal:circuit_breaker:${containerName}`,
          source: "docker",
          severity: "critical",
          title: `容器 ${containerName} Jev 智能熔断`,
          detail: `Jev 诊断发现硬性致命故障【${diag.category_label}】(置信度 ${Math.round(diag.confidence * 100)}%)：${diag.summary}。已智能阻断盲目重启。建议: ${diag.recommendation}`,
        }).catch(console.error);

        audit({
          username: "autoheal",
          action: "docker.autoheal.circuit_breaker",
          targetType: "container",
          targetId: containerName,
          detail: `Jev 智能决策提前熔断: ${diag.category_label} - ${diag.recommendation}`,
          result: "error",
        });
        return;
      }
      jevAdvice = ` [Jev诊断: ${diag.category_label}]`;
    } catch {
      // 容错降级，不阻断正常自愈流程
    }
  }

  // 3. 在重试配额内，自动执行拉起重启
  record.restarting = true;
  try {
    const provider = getDockerProvider();
    await provider.action(containerId, "restart", 10);

    audit({
      username: "autoheal",
      action: "docker.autoheal.restart",
      targetType: "container",
      targetId: containerName,
      detail: `自动故障自愈: 检测到容器 ${reason === "oom" ? "OOM 内存溢出" : `异常退出 (${exitCode})`}，正在执行第 ${record.count}/${maxRetries} 次自动重启${jevAdvice}`,
      result: "ok",
    });

    await announce({
      alertKey: `autoheal:restarted:${containerName}`,
      source: "docker",
      severity: "warning",
      title: `容器 ${containerName} 故障自动重启`,
      detail: `自愈引擎已尝试重新拉起该容器 (第 ${record.count}/${maxRetries} 次尝试)。原因: ${reason === "oom" ? "OOM 内存溢出" : `异常退出 (Code: ${exitCode})`}${jevAdvice}。`,
    }).catch(console.error);
  } catch (error) {
    console.error(`[autoheal] 无法重启容器 ${containerName}:`, error);
  } finally {
    if (record) {
      record.restarting = false;
    }
  }
}
