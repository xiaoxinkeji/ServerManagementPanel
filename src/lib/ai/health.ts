import { askJevCore } from "./jev.ts";
import { generateHeuristicPrescription } from "./llm.ts";

export interface SystemHealthIssue {
  id: string;
  source: "docker" | "system" | "network" | "disk";
  title: string;
  category: string;
  severity: "critical" | "warning" | "info";
  description: string;
  jevConfidence: number;
  recommendation: string;
  commands: string[];
}

export interface SystemHealthReport {
  score: number; // 0 - 100
  rating: "Excellent" | "Good" | "Fair" | "Critical";
  checkedAt: number;
  summary: {
    totalContainers: number;
    unhealthyContainers: number;
    crashedContainers: number;
    totalIssues: number;
    criticalIssues: number;
  };
  issues: SystemHealthIssue[];
}

/**
 * 纯逻辑：根据容器与系统体征指标生成全面的 AI 诊断报表
 */
export async function generateSystemHealthReportCore(input: {
  containers: Array<{
    id: string;
    name: string;
    status: string;
    state: string;
    restartCount?: number;
    logsSample?: string;
  }>;
  system: {
    cpuPercent?: number;
    memPercent?: number;
    diskPercent?: number;
    uptimeSeconds?: number;
  };
}): Promise<SystemHealthReport> {
  const issues: SystemHealthIssue[] = [];
  const totalContainers = input.containers.length;
  let unhealthyCount = 0;
  let crashedCount = 0;

  // 1. 分析容器异常
  for (const c of input.containers) {
    const isRunning = c.state === "running";
    const isDeadOrExited = c.state === "exited" || c.state === "dead";
    const isRestarting = c.state === "restarting";

    if (!isRunning) {
      if (isDeadOrExited) crashedCount++;
      unhealthyCount++;

      // 调用 Jev System 1 进行特征归因
      const jev = await askJevCore({
        type: "choice",
        context: `Container: ${c.name}\nState: ${c.state}\nStatus: ${c.status}\nLogs:\n${c.logsSample || "no recent logs"}`,
        question: "What is the primary cause of container failure or status?",
        options: [
          "oom_killed",
          "network_timeout",
          "config_syntax_error",
          "permission_denied",
          "database_error",
          "unhealthy",
          "unknown",
        ],
      });

      const cat = String(jev.answer || "unknown");
      const prescription = generateHeuristicPrescription(c.name, cat);

      issues.push({
        id: `container:${c.name}`,
        source: "docker",
        title: `容器异常: ${c.name} (${c.status})`,
        category: cat,
        severity: isDeadOrExited || isRestarting ? "critical" : "warning",
        description: jev.reasoning || `容器状态为 ${c.status}，Jev 诊断归因为 ${cat}`,
        jevConfidence: jev.confidence,
        recommendation: prescription.explanation,
        commands: prescription.commands,
      });
    } else if ((c.restartCount ?? 0) > 3) {
      issues.push({
        id: `container:restarts:${c.name}`,
        source: "docker",
        title: `容器频繁重启: ${c.name}`,
        category: "unhealthy",
        severity: "warning",
        description: `容器已累计重启 ${c.restartCount} 次，可能存在间歇性崩溃。`,
        jevConfidence: 0.85,
        recommendation: "查看该容器完整日志排查偶发性崩溃，检查是否触及资源边界或网络超时。",
        commands: [`docker logs --tail 100 ${c.name}`],
      });
    }
  }

  // 2. 分析系统硬件资源压力
  if (typeof input.system.cpuPercent === "number" && input.system.cpuPercent > 90) {
    issues.push({
      id: "system:cpu",
      source: "system",
      title: "CPU 使用率过高告警",
      category: "resource_exhaustion",
      severity: input.system.cpuPercent > 95 ? "critical" : "warning",
      description: `系统 CPU 使用率已达 ${input.system.cpuPercent.toFixed(1)}%，可能导致服务响应变慢。`,
      jevConfidence: 0.95,
      recommendation: "排查高负载容器进程，考虑在面板中为占用过高的容器动态下调 CPU 配额。",
      commands: ["docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}'"],
    });
  }

  if (typeof input.system.memPercent === "number" && input.system.memPercent > 90) {
    issues.push({
      id: "system:memory",
      source: "system",
      title: "内存资源告急告警",
      category: "oom_risk",
      severity: input.system.memPercent > 95 ? "critical" : "warning",
      description: `系统内存已使用 ${input.system.memPercent.toFixed(1)}%，极易触发 Linux 内核 OOM Killer 杀进程。`,
      jevConfidence: 0.95,
      recommendation: "清理停止的容器缓存或调大关键数据库容器的内存上限，并避免无限制容器抢占宿主机总内存。",
      commands: ["free -h", "docker system df"],
    });
  }

  if (typeof input.system.diskPercent === "number" && input.system.diskPercent > 85) {
    issues.push({
      id: "system:disk",
      source: "disk",
      title: "磁盘分区存储空间不足",
      category: "disk_full",
      severity: input.system.diskPercent > 92 ? "critical" : "warning",
      description: `数据盘使用率已达到 ${input.system.diskPercent.toFixed(1)}%，不足可能导致 Docker 写入日志崩溃或 SQLite 数据库只读锁死。`,
      jevConfidence: 0.98,
      recommendation: "在面板中执行悬空无用镜像清理 (Prune) 或使用日志截断功能释放磁盘空间。",
      commands: ["docker system prune -f", "df -h"],
    });
  }

  // 计算健康评分 (Score: 100 满分)
  const criticalCount = issues.filter((i) => i.severity === "critical").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;
  let score = 100 - criticalCount * 25 - warningCount * 15;
  score = Math.max(0, Math.min(100, score));

  let rating: SystemHealthReport["rating"] = "Excellent";
  if (score < 50) rating = "Critical";
  else if (score < 75) rating = "Fair";
  else if (score < 90) rating = "Good";

  return {
    score,
    rating,
    checkedAt: Date.now(),
    summary: {
      totalContainers,
      unhealthyContainers: unhealthyCount,
      crashedContainers: crashedCount,
      totalIssues: issues.length,
      criticalIssues: criticalCount,
    },
    issues,
  };
}
