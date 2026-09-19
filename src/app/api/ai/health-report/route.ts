import { guardApi } from "@/lib/auth/api";
import { getDockerProvider, getMetricsProvider, getSystemProvider } from "@/lib/providers";
import { generateSystemHealthReportCore } from "@/lib/ai/health";

export const dynamic = "force-dynamic";

/**
 * 全机一键 AI 体检与健康报表 API
 */
export async function GET(request: Request) {
  const guard = await guardApi(request, "panel.view");
  if (!guard.ok) return guard.response;

  try {
    const dockerProvider = getDockerProvider();
    const systemProvider = getSystemProvider();
    const metricsProvider = getMetricsProvider();

    const [containerList, systemInfo, metricSamples] = await Promise.all([
      dockerProvider.list(true),
      systemProvider.info(),
      metricsProvider.sample().catch(() => []),
    ]);

    // 针对非运行中或有异常的容器，提取最新 15 行日志作为样本特征
    const containersWithLogs = await Promise.all(
      containerList.map(async (c) => {
        let logsSample = "";
        if (c.state !== "running") {
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 1200);
          try {
            const chunks: string[] = [];
            for await (const line of dockerProvider.logs(c.id, { tail: 15, follow: false, signal: ctrl.signal })) {
              chunks.push(typeof line === "string" ? line : line.text);
            }
            logsSample = chunks.join("\n");
          } catch {
            // 忽略读取超时
          } finally {
            clearTimeout(t);
          }
        }
        return {
          id: c.id,
          name: c.name.replace(/^\//, ""),
          status: c.status,
          state: c.state,
          restartCount: 0,
          logsSample,
        };
      }),
    );

    // 从指标采样中精确提取内存、CPU与磁盘百分比
    const memSample = metricSamples.find((s) => s.metric === "memory_used_percent");
    const cpuSample = metricSamples.find((s) => s.metric === "cpu_percent");
    const diskSample = metricSamples.find((s) => s.metric === "disk_used_percent");

    const report = await generateSystemHealthReportCore({
      containers: containersWithLogs,
      system: {
        cpuPercent: cpuSample?.value,
        memPercent: memSample?.value,
        diskPercent: diskSample?.value,
        uptimeSeconds: systemInfo.uptimeSeconds,
      },
    });

    return Response.json({ ok: true, report });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return Response.json({ error: msg }, { status: 400 });
  }
}
