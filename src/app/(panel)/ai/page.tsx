"use client";

import { useState, useEffect, useCallback } from "react";
import { Sparkles, Brain, ShieldCheck, Terminal, Cpu, History, Activity, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { CSRF_COOKIE, CSRF_HEADER } from "@/lib/auth/types";

function readCsrfToken(): string {
  const match = document.cookie.match(new RegExp(`(?:^|; )${CSRF_COOKIE}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : "";
}

type DiagnosisRecord = {
  id: number;
  ts: number;
  containerName: string;
  trigger: "manual" | "autoheal";
  category: string;
  confidence: number;
  isFatal: boolean;
};

type Stats = { total: number; fatal: number; byCategory: Record<string, number> };

type DiagnosisResult = {
  category: string;
  category_label: string;
  is_fatal: boolean;
  can_autoheal: boolean;
  confidence: number;
  summary: string;
  recommendation: string;
  source: string;
  latency_ms: number;
  evidence?: string[];
};

type DecisionResult = {
  answer: string | number | boolean;
  confidence: number;
  reasoning?: string;
  engine: string;
  latency_ms: number;
  evidence?: string[];
  distribution?: Record<string, number>;
};

export default function AiScreen() {
  const [config, setConfig] = useState<{ mode: string; endpoint: string; model: string } | null>(null);
  const [containers, setContainers] = useState<Array<{ id: string; name: string; status: string }>>([]);
  const [history, setHistory] = useState<DiagnosisRecord[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);

  // 自定义决策测试
  const [context, setContext] = useState("nginx: [emerg] open() '/etc/nginx/nginx.conf' failed (2: No such file or directory)");
  const [question, setQuestion] = useState("What is the primary cause of error?");
  const [requestType, setRequestType] = useState<"choice" | "score" | "boolean">("choice");
  const [options, setOptions] = useState("config_syntax_error, oom_killed, network_timeout, permission_denied");
  const [running, setRunning] = useState(false);
  const [decisionResult, setDecisionResult] = useState<DecisionResult | null>(null);

  // 一键容器诊断
  const [selectedContainer, setSelectedContainer] = useState("");
  const [diagnosing, setDiagnosing] = useState(false);
  const [diagError, setDiagError] = useState<string | null>(null);
  const [diagResult, setDiagResult] = useState<{ container?: { name: string; status: string }; diagnosis: DiagnosisResult } | null>(null);

  // 全机一键健康体检
  const [healthChecking, setHealthChecking] = useState(false);
  const [healthReport, setHealthReport] = useState<{
    score: number;
    rating: string;
    checkedAt: number;
    summary: {
      totalContainers: number;
      unhealthyContainers: number;
      crashedContainers: number;
      totalIssues: number;
      criticalIssues: number;
    };
    issues: Array<{
      id: string;
      source: string;
      title: string;
      category: string;
      severity: string;
      description: string;
      jevConfidence: number;
      recommendation: string;
      commands: string[];
    }>;
  } | null>(null);

  const runHealthCheck = async () => {
    setHealthChecking(true);
    try {
      const res = await fetch("/api/ai/health-report");
      if (res.ok) {
        const json = await res.json();
        setHealthReport(json.report);
      }
    } catch {
      // 忽略
    } finally {
      setHealthChecking(false);
    }
  };

  const loadData = useCallback(() => {
    fetch("/api/ai")
      .then((r) => r.json())
      .then((data) => {
        setConfig(data.config);
        setContainers(data.containers || []);
        setHistory(data.history || []);
        setStats(data.stats || null);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAsk = async () => {
    setRunning(true);
    try {
      const opts = options.split(",").map((s) => s.trim()).filter(Boolean);
      const request =
        requestType === "choice"
          ? { type: "choice", context, question, options: opts }
          : requestType === "score"
            ? { type: "score", context, question, min: 0, max: 10 }
            : { type: "boolean", context, question };
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [CSRF_HEADER]: readCsrfToken(),
        },
        body: JSON.stringify({ action: "ask", request }),
      });
      if (res.ok) {
        const json = await res.json();
        setDecisionResult(json.result);
      }
    } catch {
      // 忽略
    } finally {
      setRunning(false);
    }
  };

  const handleDiagnose = async () => {
    if (!selectedContainer) return;
    setDiagnosing(true);
    setDiagError(null);
    setDiagResult(null);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [CSRF_HEADER]: readCsrfToken(),
        },
        body: JSON.stringify({ action: "diagnose", containerId: selectedContainer }),
      });
      const json = await res.json();
      if (res.ok) {
        setDiagResult(json);
        loadData(); // 刷新诊断历史
      } else {
        setDiagError(json.error || "Diagnosis failed");
      }
    } catch {
      setDiagError("Network error");
    } finally {
      setDiagnosing(false);
    }
  };

  const lastLatency = diagResult?.diagnosis.latency_ms ?? decisionResult?.latency_ms;
  const topCategory = stats && Object.keys(stats.byCategory).length > 0
    ? Object.entries(stats.byCategory).sort((a, b) => b[1] - a[1])[0][0]
    : "—";

  return (
    <div className="space-y-6 max-w-6xl">
      {/* 头部 Hero 区域 - Jobs 极简美学设计 */}
      <div className="relative overflow-hidden rounded-3xl border border-line/60 bg-gradient-to-b from-surface/80 via-surface/60 to-surface/40 p-8 shadow-xs backdrop-blur-xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand/10 px-3 py-1 text-xs font-medium text-brand">
              <Sparkles className="size-3.5 animate-pulse" />
              <span>Jev System One 极速决策中枢</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">
              AI 智能运维与故障自愈工作台
            </h1>
            <p className="max-w-2xl text-sm text-subtle leading-relaxed">
              基于 TypeSafe Jev 决策模型与毫秒级类型化推理内核，专为容器日志故障分类、不可逆错误阻断与自动化运维决策打造。
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={healthChecking}
              onClick={runHealthCheck}
              className="inline-flex items-center gap-2 rounded-2xl bg-brand px-5 py-3 text-xs font-semibold text-white shadow-xs transition-all hover:bg-brand/90 active:scale-95 disabled:opacity-50"
            >
              <Sparkles className="size-4" />
              <span>{healthChecking ? "正在全机深度体检..." : "全机一键 AI 体检"}</span>
            </button>

            <div className="flex flex-col items-end gap-1 rounded-2xl border border-line/50 bg-surface/80 p-3.5 font-mono text-xs">
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-ok" />
                <span className="font-semibold text-ink">
                  {config?.mode === "builtin" ? "内置本地内核 (Built-in)" : config?.mode === "remote" ? "远程云端 API" : "禁用"}
                </span>
              </div>
              <span className="text-[11px] text-subtle">推理延迟: {lastLatency != null ? `~${lastLatency}ms` : "—"}</span>
              <span className="text-[11px] text-subtle">模型: {config?.model || "jev-1"}</span>
            </div>
          </div>
        </div>

        {/* 健康体检大盘报告卡片 */}
        {healthReport && (
          <div className="mt-6 rounded-2xl border border-line/80 bg-surface/90 p-5 shadow-xs animate-in fade-in">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line/50 pb-4">
              <div className="flex items-center gap-3">
                <div
                  className={`flex size-12 items-center justify-center rounded-2xl font-bold text-lg ${
                    healthReport.score >= 90
                      ? "bg-ok/10 text-ok border border-ok/30"
                      : healthReport.score >= 75
                      ? "bg-brand/10 text-brand border border-brand/30"
                      : healthReport.score >= 50
                      ? "bg-warn/10 text-warn border border-warn/30"
                      : "bg-danger/10 text-danger border border-danger/30"
                  }`}
                >
                  {healthReport.score}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-ink">全系统综合健康度: {healthReport.rating}</span>
                    <span className="text-xs text-subtle font-mono">
                      (耗时检测完成于 {new Date(healthReport.checkedAt).toLocaleTimeString()})
                    </span>
                  </div>
                  <p className="text-xs text-subtle mt-0.5">
                    已体检 {healthReport.summary.totalContainers} 个容器，发现 {healthReport.summary.totalIssues} 项隐患，其中 {healthReport.summary.criticalIssues} 项严重。
                  </p>
                </div>
              </div>
            </div>

            {healthReport.issues.length === 0 ? (
              <p className="mt-4 text-xs text-ok font-medium flex items-center gap-1.5">
                <CheckCircle2 className="size-4" /> 完美！所有运行容器与系统资源负载均处于优秀健康区间。
              </p>
            ) : (
              <div className="mt-4 space-y-2.5">
                {healthReport.issues.map((iss) => (
                  <div key={iss.id} className="rounded-xl border border-line/60 bg-canvas/40 p-3.5 text-xs space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 font-medium text-ink">
                        {iss.severity === "critical" ? (
                          <XCircle className="size-4 text-danger shrink-0" />
                        ) : (
                          <AlertTriangle className="size-4 text-warn shrink-0" />
                        )}
                        <span>{iss.title}</span>
                        <span className="rounded-full bg-line/60 px-2 py-0.5 text-[10px] font-mono text-subtle">
                          {iss.category}
                        </span>
                      </div>
                      <span className="text-[11px] font-mono text-brand font-semibold">
                        Jev置信度: {Math.round(iss.jevConfidence * 100)}%
                      </span>
                    </div>
                    <p className="text-subtle leading-relaxed">{iss.description}</p>
                    <div className="rounded-lg bg-surface/80 p-2.5 border border-line/40">
                      <span className="font-semibold text-ink">专家建议: </span>
                      <span className="text-subtle">{iss.recommendation}</span>
                    </div>
                    {iss.commands && iss.commands.length > 0 && (
                      <div className="rounded-lg bg-canvas p-2 font-mono text-[11px] text-ink overflow-x-auto border border-line/40">
                        <pre>{iss.commands.join("\n")}</pre>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 核心特性与架构能力展示 */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-3xl border border-line/60 bg-surface/80 p-6 shadow-sm backdrop-blur-xl transition-all duration-300 hover:border-line hover:shadow-md">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-brand/10 text-brand shadow-2xs">
            <Cpu className="size-5.5" />
          </div>
          <h3 className="mt-4 font-semibold text-ink text-sm tracking-tight">零开销毫秒级决策</h3>
          <p className="mt-1 text-xs text-subtle leading-relaxed">
            无需下载庞大模型权重，纯 CPU 概率矩阵计算，0 额外存储负担，即刻对日志故障进行精准分类。
          </p>
        </div>

        <div className="rounded-3xl border border-line/60 bg-surface/80 p-6 shadow-sm backdrop-blur-xl transition-all duration-300 hover:border-line hover:shadow-md">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-warn/10 text-warn shadow-2xs">
            <ShieldCheck className="size-5.5" />
          </div>
          <h3 className="mt-4 font-semibold text-ink text-sm tracking-tight">故障自愈智能熔断</h3>
          <p className="mt-1 text-xs text-subtle leading-relaxed">
            与面板 Docker 自愈引擎深度联动。遇到不可恢复的硬性配置或权限故障时，提前智能阻断重启死循环。
          </p>
        </div>

        <div className="rounded-3xl border border-line/60 bg-surface/80 p-6 shadow-sm backdrop-blur-xl transition-all duration-300 hover:border-line hover:shadow-md">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-ok/10 text-ok shadow-2xs">
            <Terminal className="size-5.5" />
          </div>
          <h3 className="mt-4 font-semibold text-ink text-sm tracking-tight">容器日志即时诊断</h3>
          <p className="mt-1 text-xs text-subtle leading-relaxed">
            实时容器日志查看器内置 Jev 诊断探针，一键提取异常堆栈，输出置信度百分比与精准治理建议。
          </p>
        </div>
      </div>

      {/* 一键容器 Jev 诊断 */}
      <div className="rounded-3xl border border-line/60 bg-surface/80 p-7 shadow-sm backdrop-blur-xl">
        <div className="flex items-center justify-between border-b border-line/40 pb-4">
          <div className="flex items-center gap-2.5">
            <Activity className="size-5 text-brand" />
            <h2 className="font-semibold text-ink text-base tracking-tight">容器一键诊断 (Container Quick Diagnose)</h2>
          </div>
          <span className="text-xs text-subtle">读取容器近期 100 行日志并输出故障分类报告</span>
        </div>

        <div className="mt-5 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={selectedContainer}
              onChange={(e) => setSelectedContainer(e.target.value)}
              className="min-w-56 rounded-2xl border border-line bg-canvas/60 p-3 text-xs text-ink focus:border-brand focus:outline-none"
            >
              <option value="">选择目标容器...</option>
              {containers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.status})
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={diagnosing || !selectedContainer}
              onClick={handleDiagnose}
              className="inline-flex items-center gap-2 rounded-2xl bg-brand px-5 py-3 text-xs font-semibold text-white shadow-sm transition-all hover:bg-brand/90 active:scale-95 disabled:opacity-50"
            >
              <Sparkles className="size-3.5" />
              <span>{diagnosing ? "Jev 诊断中..." : "一键 Jev 诊断"}</span>
            </button>
          </div>

          {diagError && (
            <p className="rounded border border-danger/40 px-3 py-1.5 text-xs text-danger">
              {diagError}
            </p>
          )}

          {diagResult && (
            <div className="rounded-xl border border-brand/30 bg-brand/5 p-4">
              <div className="flex items-center justify-between border-b border-brand/20 pb-2">
                <span className="font-semibold text-brand text-xs">
                  {diagResult.container?.name} 诊断报告
                </span>
                <span className="text-[11px] text-subtle font-mono">
                  耗时: {diagResult.diagnosis.latency_ms}ms · 引擎: {diagResult.diagnosis.source}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-base font-bold text-ink">{diagResult.diagnosis.category_label}</span>
                <span className="rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-semibold text-brand">
                  置信度: {Math.round(diagResult.diagnosis.confidence * 100)}%
                </span>
                {diagResult.diagnosis.is_fatal && (
                  <span className="rounded-full bg-danger/10 px-2.5 py-0.5 text-xs font-semibold text-danger">致命故障</span>
                )}
                {diagResult.diagnosis.can_autoheal && (
                  <span className="rounded-full bg-ok/10 px-2.5 py-0.5 text-xs font-semibold text-ok">可自愈</span>
                )}
              </div>
              <p className="mt-2 text-xs text-subtle leading-relaxed">{diagResult.diagnosis.summary}</p>
              <p className="mt-1 text-xs text-subtle leading-relaxed">
                <span className="font-medium text-ink">修复建议：</span>
                {diagResult.diagnosis.recommendation}
              </p>
              {diagResult.diagnosis.evidence && diagResult.diagnosis.evidence.length > 0 && (
                <div className="mt-2">
                  <span className="text-xs font-medium text-ink">关键证据行：</span>
                  <ul className="mt-1 space-y-0.5 font-mono text-[11px] text-subtle">
                    {diagResult.diagnosis.evidence.map((line, i) => (
                      <li key={i} className="truncate">{line}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 近期诊断历史 */}
      <div className="rounded-2xl border border-line/60 bg-surface/70 p-6 shadow-xs backdrop-blur-md">
        <div className="flex items-center justify-between border-b border-line/40 pb-4">
          <div className="flex items-center gap-2">
            <History className="size-5 text-brand" />
            <h2 className="font-semibold text-ink text-base">近期诊断历史</h2>
          </div>
          <div className="flex items-center gap-2 text-[11px]">
            <span className="rounded-full bg-brand/10 px-2.5 py-0.5 font-semibold text-brand">
              7 天诊断次数: {stats?.total ?? 0}
            </span>
            <span className="rounded-full bg-danger/10 px-2.5 py-0.5 font-semibold text-danger">
              致命故障数: {stats?.fatal ?? 0}
            </span>
            <span className="rounded-full bg-warn/10 px-2.5 py-0.5 font-semibold text-warn">
              Top 类别: {topCategory}
            </span>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          {history.length === 0 ? (
            <p className="py-4 text-center text-xs text-subtle">暂无诊断记录，执行一次一键诊断后将在此展示。</p>
          ) : (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-line/40 text-subtle">
                  <th className="py-2 pr-3 font-medium">时间</th>
                  <th className="py-2 pr-3 font-medium">容器</th>
                  <th className="py-2 pr-3 font-medium">触发</th>
                  <th className="py-2 pr-3 font-medium">类别</th>
                  <th className="py-2 pr-3 font-medium">置信度</th>
                  <th className="py-2 font-medium">严重性</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="border-b border-line/20 last:border-0">
                    <td className="py-2 pr-3 font-mono text-subtle whitespace-nowrap">
                      {new Date(h.ts * 1000).toLocaleString()}
                    </td>
                    <td className="py-2 pr-3 font-mono text-ink">{h.containerName}</td>
                    <td className="py-2 pr-3 text-subtle">{h.trigger === "autoheal" ? "自愈" : "手动"}</td>
                    <td className="py-2 pr-3 font-mono text-ink">{h.category}</td>
                    <td className="py-2 pr-3 text-subtle">{Math.round(h.confidence * 100)}%</td>
                    <td className="py-2">
                      {h.isFatal ? (
                        <span className="rounded bg-danger/10 px-1.5 py-0.5 text-[10px] font-semibold text-danger">致命</span>
                      ) : (
                        <span className="text-subtle">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Jev System One 交互式决策操练台 */}
      <div className="rounded-3xl border border-line/60 bg-surface/80 p-7 shadow-sm backdrop-blur-xl">
        <div className="flex items-center justify-between border-b border-line/40 pb-4">
          <div className="flex items-center gap-2.5">
            <Brain className="size-5 text-brand" />
            <h2 className="font-semibold text-ink text-base tracking-tight">Jev System One 决策操练场 (Decision Playground)</h2>
          </div>
          <span className="text-xs text-subtle">向 Jev 提出非结构化上下文与类型化问题</span>
        </div>

        <div className="mt-5 space-y-4">
          {containers.length > 0 && (
            <div>
              <span className="block text-xs font-medium text-subtle mb-1.5">快速载入本机容器上下文</span>
              <div className="flex flex-wrap gap-1.5">
                {containers.slice(0, 8).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setContext(`Container: ${c.name}\nStatus: ${c.status}\nInspect: normal operational check.`);
                      setQuestion("Is this container in healthy operational state?");
                      setOptions("normal_operation, unhealthy, unknown");
                    }}
                    className="rounded-lg border border-line/60 bg-canvas/40 px-2 py-1 text-[11px] font-mono text-subtle hover:border-brand hover:text-brand"
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-subtle mb-1.5">上下文或异常日志 (Context)</label>
            <textarea
              rows={3}
              value={context}
              onChange={(e) => setContext(e.target.value)}
              className="w-full rounded-xl border border-line bg-canvas/60 p-3 font-mono text-xs leading-relaxed text-ink focus:border-brand focus:outline-none"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-subtle mb-1.5">类型化判定问题 (Typed Question)</label>
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                className="w-full rounded-xl border border-line bg-canvas/60 p-2.5 text-xs text-ink focus:border-brand focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-subtle mb-1.5">判定模式 (Request Type)</label>
              <select
                value={requestType}
                onChange={(e) => setRequestType(e.target.value as "choice" | "score" | "boolean")}
                className="w-full rounded-xl border border-line bg-canvas/60 p-2.5 text-xs text-ink focus:border-brand focus:outline-none"
              >
                <option value="choice">choice (选项分类)</option>
                <option value="score">score (严重度评分 0-10)</option>
                <option value="boolean">boolean (是/否判定)</option>
              </select>
            </div>
          </div>

          {requestType === "choice" && (
            <div>
              <label className="block text-xs font-medium text-subtle mb-1.5">候选选项集 (Options, 逗号分隔)</label>
              <input
                type="text"
                value={options}
                onChange={(e) => setOptions(e.target.value)}
                className="w-full rounded-xl border border-line bg-canvas/60 p-2.5 font-mono text-xs text-ink focus:border-brand focus:outline-none"
              />
            </div>
          )}

          <div className="flex justify-end pt-2">
            <button
              type="button"
              disabled={running || !context.trim()}
              onClick={handleAsk}
              className="inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-xs font-semibold text-white shadow-xs transition-all hover:bg-brand/90 active:scale-95 disabled:opacity-50"
            >
              <Sparkles className="size-3.5" />
              <span>{running ? "Jev 推理计算中..." : "执行 Jev 类型化决策"}</span>
            </button>
          </div>

          {decisionResult && (
            <div className="mt-4 rounded-xl border border-brand/30 bg-brand/5 p-4">
              <div className="flex items-center justify-between border-b border-brand/20 pb-2">
                <span className="font-semibold text-brand text-xs">Jev 决策结果</span>
                <span className="text-[11px] text-subtle font-mono">
                  耗时: {decisionResult.latency_ms}ms · 引擎: {decisionResult.engine}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <span className="text-lg font-bold text-ink font-mono">{String(decisionResult.answer)}</span>
                <span className="rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-semibold text-brand">
                  置信度: {Math.round(decisionResult.confidence * 100)}%
                </span>
              </div>
              {decisionResult.reasoning && (
                <p className="mt-2 text-xs text-subtle leading-relaxed">{decisionResult.reasoning}</p>
              )}
              {decisionResult.distribution && Object.keys(decisionResult.distribution).length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {Object.entries(decisionResult.distribution)
                    .sort((a, b) => b[1] - a[1])
                    .map(([opt, p]) => (
                      <div key={opt} className="flex items-center gap-2">
                        <span className="w-40 truncate font-mono text-[11px] text-subtle">{opt}</span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-line/40">
                          <div
                            className="h-full rounded-full bg-brand/70"
                            style={{ width: `${Math.min(100, Math.round(p * 100))}%` }}
                          />
                        </div>
                        <span className="w-10 text-right font-mono text-[11px] text-ink">
                          {Math.round(p * 100)}%
                        </span>
                      </div>
                    ))}
                </div>
              )}
              {decisionResult.evidence && decisionResult.evidence.length > 0 && (
                <div className="mt-3">
                  <span className="text-xs font-medium text-ink">关键证据行：</span>
                  <ul className="mt-1 space-y-0.5 font-mono text-[11px] text-subtle">
                    {decisionResult.evidence.map((line, i) => (
                      <li key={i} className="truncate">{line}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
