"use client";

import { useState, useEffect } from "react";
import { Sparkles, Brain, ShieldCheck, Terminal, Cpu } from "lucide-react";
import { CSRF_COOKIE, CSRF_HEADER } from "@/lib/auth/types";

function readCsrfToken(): string {
  const match = document.cookie.match(new RegExp(`(?:^|; )${CSRF_COOKIE}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : "";
}

export default function AiScreen() {
  const [config, setConfig] = useState<{ mode: string; endpoint: string; model: string } | null>(null);
  const [containers, setContainers] = useState<Array<{ id: string; name: string; status: string }>>([]);
  
  // 自定义决策测试
  const [context, setContext] = useState("nginx: [emerg] open() '/etc/nginx/nginx.conf' failed (2: No such file or directory)");
  const [question, setQuestion] = useState("What is the primary cause of error?");
  const [options, setOptions] = useState("config_syntax_error, oom_killed, network_timeout, permission_denied");
  const [running, setRunning] = useState(false);
  const [decisionResult, setDecisionResult] = useState<{
    answer: string | number | boolean;
    confidence: number;
    reasoning?: string;
    engine: string;
    latency_ms: number;
  } | null>(null);

  useEffect(() => {
    fetch("/api/ai")
      .then((r) => r.json())
      .then((data) => {
        setConfig(data.config);
        setContainers(data.containers || []);
      })
      .catch(() => {});
  }, []);

  const handleAsk = async () => {
    setRunning(true);
    try {
      const opts = options.split(",").map((s) => s.trim()).filter(Boolean);
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [CSRF_HEADER]: readCsrfToken(),
        },
        body: JSON.stringify({
          action: "ask",
          request: {
            type: "choice",
            context,
            question,
            options: opts,
          },
        }),
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

          <div className="flex flex-col items-end gap-1 rounded-2xl border border-line/50 bg-surface/80 p-4 font-mono text-xs">
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-ok" />
              <span className="font-semibold text-ink">
                {config?.mode === "builtin" ? "内置本地内核 (Built-in)" : config?.mode === "remote" ? "远程云端 API" : "禁用"}
              </span>
            </div>
            <span className="text-[11px] text-subtle">推理延迟: ~2ms</span>
            <span className="text-[11px] text-subtle">模型: {config?.model || "jev-1"}</span>
          </div>
        </div>
      </div>

      {/* 核心特性与架构能力展示 */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-line/60 bg-surface/70 p-5 shadow-xs backdrop-blur-md transition-all hover:border-line hover:shadow-sm">
          <div className="flex size-10 items-center justify-center rounded-xl bg-brand/10 text-brand">
            <Cpu className="size-5" />
          </div>
          <h3 className="mt-3 font-semibold text-ink text-sm">零开销毫秒级决策</h3>
          <p className="mt-1 text-xs text-subtle leading-relaxed">
            无需下载庞大模型权重，纯 CPU 概率矩阵计算，0 额外存储负担，即刻对日志故障进行精准分类。
          </p>
        </div>

        <div className="rounded-2xl border border-line/60 bg-surface/70 p-5 shadow-xs backdrop-blur-md transition-all hover:border-line hover:shadow-sm">
          <div className="flex size-10 items-center justify-center rounded-xl bg-warn/10 text-warn">
            <ShieldCheck className="size-5" />
          </div>
          <h3 className="mt-3 font-semibold text-ink text-sm">故障自愈智能熔断</h3>
          <p className="mt-1 text-xs text-subtle leading-relaxed">
            与面板 Docker 自愈引擎深度联动。遇到不可恢复的硬性配置或权限故障时，提前智能阻断重启死循环。
          </p>
        </div>

        <div className="rounded-2xl border border-line/60 bg-surface/70 p-5 shadow-xs backdrop-blur-md transition-all hover:border-line hover:shadow-sm">
          <div className="flex size-10 items-center justify-center rounded-xl bg-ok/10 text-ok">
            <Terminal className="size-5" />
          </div>
          <h3 className="mt-3 font-semibold text-ink text-sm">容器日志即时诊断</h3>
          <p className="mt-1 text-xs text-subtle leading-relaxed">
            实时容器日志查看器内置 Jev 诊断探针，一键提取异常堆栈，输出置信度百分比与精准治理建议。
          </p>
        </div>
      </div>

      {/* Jev System One 交互式决策操练台 */}
      <div className="rounded-2xl border border-line/60 bg-surface/70 p-6 shadow-xs backdrop-blur-md">
        <div className="flex items-center justify-between border-b border-line/40 pb-4">
          <div className="flex items-center gap-2">
            <Brain className="size-5 text-brand" />
            <h2 className="font-semibold text-ink text-base">Jev System One 决策操练场 (Decision Playground)</h2>
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
              <label className="block text-xs font-medium text-subtle mb-1.5">候选选项集 (Options, 逗号分隔)</label>
              <input
                type="text"
                value={options}
                onChange={(e) => setOptions(e.target.value)}
                className="w-full rounded-xl border border-line bg-canvas/60 p-2.5 font-mono text-xs text-ink focus:border-brand focus:outline-none"
              />
            </div>
          </div>

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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
