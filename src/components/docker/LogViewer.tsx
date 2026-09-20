"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Minus, Pause, Play, Plus, Search, Trash2, Sparkles, CheckCircle2, AlertTriangle, XCircle, Bot, Copy, Check } from "lucide-react";

import { parseAnsi, stripAnsi, type AnsiSpan } from "@/lib/logs/ansi";
import { fold } from "@/lib/text";
import { useFormat, useT } from "@/lib/i18n/client";
import { CSRF_COOKIE, CSRF_HEADER } from "@/lib/auth/types";

/**
 * Canlı container logu (M1.7).
 *
 * `EventSource` kullanılıyor: kopan bağlantıyı tarayıcı kendiliğinden yeniden
 * kuruyor ve normal HTTP olduğu için proxy arkasında ek yapılandırma gerekmiyor.
 *
 * İki küçük ama önemli davranış:
 *   - Otomatik kaydırma YALNIZCA kullanıcı en alttayken yapılır. Yukarı çıkıp
 *     bir hatayı okuyan kişiyi her yeni satırda aşağı fırlatmak sinir bozucudur.
 *   - Bellekte tutulan satır sayısı sınırlı; günlerce açık kalan bir pencere
 *     sekmeyi şişirmemeli.
 */

type Line = { stream: string; ts: string | null; text: string };

const MAX_LINES = 2000;

/** Font boyutu sınırları (px); dışına çıkmak satırları okunmaz yapıyor. */
const MIN_FONT = 9;
const MAX_FONT = 18;

/**
 * ANSI palet adlarının CSS karşılıkları.
 *
 * Ham ANSI renkleri (saf yeşil gibi) koyu zeminde göz yakıyor ve açık temada
 * okunmuyor. Panelin kendi paletini kullanmak logu arayüzün geri kalanıyla
 * aynı görsel dile sokuyor — ve tema değişince renkler de değişiyor.
 */
const ANSI_CSS: Record<string, string> = {
  black: "#3b4048",
  red: "var(--danger)",
  green: "var(--ok)",
  yellow: "var(--warn)",
  blue: "#4c8bf5",
  magenta: "#c678dd",
  cyan: "#56b6c2",
  white: "var(--ink)",
  brightblack: "var(--subtle)",
  brightred: "#ff6b6b",
  brightgreen: "#5dd88a",
  brightyellow: "#f5c451",
  brightblue: "#74a7ff",
  brightmagenta: "#d99ae8",
  brightcyan: "#7cd6e0",
  brightwhite: "var(--ink)",
};

/** Palet adını CSS rengine çevirir; hex değerler olduğu gibi geçiyor. */
function renk(value: string | null): string | undefined {
  if (!value) return undefined;
  return value.startsWith("#") ? value : (ANSI_CSS[value] ?? undefined);
}

/** Tek bir log satırının biçimli parçaları. */
function AnsiLine({ spans }: { spans: AnsiSpan[] }) {
  return (
    <>
      {spans.map((span, index) => {
        // Biçimsiz parçaya `style` vermemek, renksiz logda (çoğu container)
        // DOM'u olduğu gibi bırakıyor.
        const bos =
          !span.fg && !span.bg && !span.bold && !span.italic && !span.underline && !span.dim;

        if (bos) return <span key={index}>{span.text}</span>;

        return (
          <span
            key={index}
            style={{
              color: renk(span.fg),
              backgroundColor: renk(span.bg),
              fontWeight: span.bold ? 600 : undefined,
              fontStyle: span.italic ? "italic" : undefined,
              textDecoration: span.underline ? "underline" : undefined,
              opacity: span.dim ? 0.6 : undefined,
            }}
          >
            {span.text}
          </span>
        );
      })}
    </>
  );
}

export function LogViewer({
  containerId,
  containerName,
  tail,
  canAct = false,
}: {
  containerId: string;
  containerName: string;
  tail: number;
  canAct?: boolean;
}) {
  const t = useT();
  const f = useFormat();
  const [lines, setLines] = useState<Line[]>([]);
  const [paused, setPaused] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [font, setFont] = useState(11);
  const [diagnosing, setDiagnosing] = useState(false);
  const [deepDiagnosing, setDeepDiagnosing] = useState(false);
  const [remediating, setRemediating] = useState<string | null>(null);
  const [remediateResult, setRemediateResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [copiedCmd, setCopiedCmd] = useState<number | null>(null);
  const [prescription, setPrescription] = useState<{
    rootCause: string;
    commands: string[];
    explanation: string;
    prevention: string;
    model: string;
    latency_ms: number;
  } | null>(null);
  const [diagnosis, setDiagnosis] = useState<{
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
  } | null>(null);

  const boxRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  // Duraklatma durumu ref'te tutuluyor: `paused` değişince SSE bağlantısının
  // yeniden kurulması gerekmiyor, yalnızca gelen satırın eklenip eklenmeyeceği
  // değişiyor. Ref'e yazmak render sırasında değil effect'te yapılmalı.
  const pausedRef = useRef(paused);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  // Container değişince bileşen parent tarafından `key` ile yeniden kuruluyor,
  // bu yüzden burada durumu elle sıfırlamak gerekmiyor.
  useEffect(() => {
    const source = new EventSource(
      `/api/docker/${encodeURIComponent(containerId)}/logs?tail=${tail}`,
    );

    source.onopen = () => setConnected(true);

    source.addEventListener("log", (event) => {
      if (pausedRef.current) return;
      const line = JSON.parse((event as MessageEvent).data) as Line;
      setLines((previous) => {
        const next = [...previous, line];
        return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next;
      });
    });

    source.addEventListener("hata", (event) => {
      const payload = JSON.parse((event as MessageEvent).data) as { message: string };
      setError(payload.message);
    });

    source.onerror = () => setConnected(false);

    return () => {
      source.close();
      setConnected(false);
    };
  }, [containerId, tail]);

  useEffect(() => {
    if (stickToBottom.current && boxRef.current) {
      boxRef.current.scrollTop = boxRef.current.scrollHeight;
    }
  }, [lines]);

  const filtered = useMemo(
    () =>
      query.trim() === ""
        ? lines
        : /*
            Arama ANSI'DEN ARINDIRILMIŞ metinde yapılıyor: renk kodlarının
            içinde eşleşme bulmak ya da renkli bir kelimenin ortasındaki kaçış
            dizisi yüzünden eşleşmeyi KAÇIRMAK, ikisi de yanlış sonuç verirdi.
          */
          lines.filter((line) =>
            fold(stripAnsi(line.text)).includes(fold(query)),
          ),
    [lines, query],
  );

  /**
   * Görünen satırları düz metin olarak indirir.
   *
   * İndirilen dosyada ANSI dizileri YOK: dosyayı bir metin düzenleyicide ya da
   * bir hata raporunda açan kişi renk kodlarını değil metni görmeli. Arama
   * süzgeci uygulanmış hâli iniyor — kullanıcı ekranda ne görüyorsa o.
   */
  const [truncating, setTruncating] = useState(false);

  async function truncateLog() {
    if (!window.confirm(t("docker.logs.truncateConfirm"))) return;
    setTruncating(true);
    try {
      const match = document.cookie.match(new RegExp(`(?:^|; )${CSRF_COOKIE}=([^;]*)`));
      const csrf = match ? decodeURIComponent(match[1]) : "";
      const res = await fetch(`/api/docker/${encodeURIComponent(containerId)}/logs/truncate`, {
        method: "POST",
        headers: { [CSRF_HEADER]: csrf },
      });
      if (res.ok) {
        setLines([]);
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Truncate failed");
      }
    } catch {
      alert("Network error");
    } finally {
      setTruncating(false);
    }
  }

  async function runDiagnosis() {
    setDiagnosing(true);
    setPrescription(null);
    try {
      const match = document.cookie.match(new RegExp(`(?:^|; )${CSRF_COOKIE}=([^;]*)`));
      const csrf = match ? decodeURIComponent(match[1]) : "";
      const res = await fetch(`/api/docker/${encodeURIComponent(containerId)}/diagnose`, {
        method: "POST",
        headers: { [CSRF_HEADER]: csrf },
      });
      if (res.ok) {
        const data = await res.json();
        setDiagnosis(data.diagnosis);
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Diagnosis failed");
      }
    } catch {
      alert("Network error");
    } finally {
      setDiagnosing(false);
    }
  }

  async function runDeepDiagnose() {
    setDeepDiagnosing(true);
    try {
      const match = document.cookie.match(new RegExp(`(?:^|; )${CSRF_COOKIE}=([^;]*)`));
      const csrf = match ? decodeURIComponent(match[1]) : "";
      const rawLogs = lines.slice(-40).map((l) => l.text).join("\n");
      const res = await fetch("/api/ai/deep-diagnose", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [CSRF_HEADER]: csrf,
        },
        body: JSON.stringify({
          containerId,
          containerName,
          logs: rawLogs,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setPrescription(data.prescription);
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Deep diagnosis failed");
      }
    } catch {
      alert("Network error");
    } finally {
      setDeepDiagnosing(false);
    }
  }

  async function executeRemediation(cmd: string) {
    if (!canAct) return;
    setRemediating(cmd);
    setRemediateResult(null);
    try {
      const match = document.cookie.match(new RegExp(`(?:^|; )${CSRF_COOKIE}=([^;]*)`));
      const csrf = match ? decodeURIComponent(match[1]) : "";
      const res = await fetch("/api/ai/remediate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [CSRF_HEADER]: csrf,
        },
        body: JSON.stringify({
          container: containerName || containerId,
          command: cmd,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setRemediateResult({
          ok: true,
          msg: data.actionExecuted || t("docker.diagnose.autoRemediateSuccess"),
        });
      } else {
        setRemediateResult({
          ok: false,
          msg: data.error || data.reason || "Execution failed",
        });
      }
    } catch {
      setRemediateResult({ ok: false, msg: "Network error" });
    } finally {
      setRemediating(null);
    }
  }

  const copyCommand = (cmd: string, idx: number) => {
    void navigator.clipboard.writeText(cmd);
    setCopiedCmd(idx);
    setTimeout(() => setCopiedCmd(null), 2000);
  };

  function download() {
    const text = filtered
      .map((line) => {
        const zaman = line.ts ? new Date(line.ts).toISOString() + " " : "";
        const akis = line.stream === "stderr" ? "[stderr] " : "";
        return zaman + akis + stripAnsi(line.text);
      })
      .join("\n");

    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = containerName + "-log.txt";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-subtle">
          <span className={`size-2 rounded-full ${connected ? "bg-ok" : "bg-line"}`} />
          {connected ? t("docker.logs.live") : t("docker.logs.disconnected")} ·{" "}
          {t("docker.logs.lines", { count: lines.length })}
        </div>

        <div className="flex w-full items-center gap-2 sm:w-auto">
          <div className="relative min-w-0 flex-1 sm:flex-none">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle"
              aria-hidden
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("docker.logs.search")}
              className="w-full rounded-md border border-line bg-canvas py-1.5 pl-8 pr-2 text-xs outline-none focus:border-brand sm:w-44"
            />
          </div>

          <button
            type="button"
            onClick={() => void runDiagnosis()}
            disabled={diagnosing}
            className="flex items-center gap-1.5 rounded-md border border-brand/40 bg-brand/5 px-2.5 py-1.5 text-xs font-medium text-brand transition-colors hover:bg-brand/10 disabled:opacity-50"
            title={t("docker.diagnose.button")}
          >
            <Sparkles className="size-3.5 animate-pulse" />
            {diagnosing ? t("docker.diagnose.running") : t("docker.diagnose.button")}
          </button>

          <button
            type="button"
            onClick={() => setPaused((v) => !v)}
            className="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-xs transition-colors hover:border-brand hover:text-brand"
          >
            {paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
            {paused ? t("docker.logs.resume") : t("docker.logs.pause")}
          </button>

          <div className="flex items-center gap-px">
            <IconOnly
              title={t("docker.terminal.fontSmaller")}
              disabled={font <= MIN_FONT}
              onClick={() => setFont((v) => Math.max(MIN_FONT, v - 1))}
            >
              <Minus className="size-3" />
            </IconOnly>
            <IconOnly
              title={t("docker.terminal.fontLarger")}
              disabled={font >= MAX_FONT}
              onClick={() => setFont((v) => Math.min(MAX_FONT, v + 1))}
            >
              <Plus className="size-3" />
            </IconOnly>
          </div>

          <IconOnly title={t("docker.logs.download")} onClick={download}>
            <Download className="size-3.5" />
          </IconOnly>

          {canAct && (
            <IconOnly
              title={t("docker.logs.truncate")}
              disabled={truncating}
              onClick={() => void truncateLog()}
            >
              <Trash2 className="size-3.5 text-danger/80 hover:text-danger" />
            </IconOnly>
          )}
        </div>
      </div>

      {error && (
        <p className="rounded border border-danger/40 px-3 py-1.5 text-xs text-danger">
          {error}
        </p>
      )}

      {diagnosis && (
        <div className="rounded-xl border border-brand/30 bg-brand/5 p-4 text-xs space-y-3 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-brand/20 pb-2.5">
            <div className="flex items-center gap-2 font-semibold text-brand text-sm">
              <Sparkles className="size-4 animate-pulse" />
              <span>{t("docker.diagnose.title")}</span>
            </div>
            <div className="flex items-center gap-2 text-subtle text-[11px] font-mono">
              <span>{t("docker.diagnose.source")}: {diagnosis.source.includes("jev") ? "Jev System One" : "Heuristic Rules"}</span>
              <span>·</span>
              <span>{t("docker.diagnose.latency")}: {diagnosis.latency_ms}ms</span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 font-medium">
                {diagnosis.is_fatal ? (
                  <XCircle className="size-4 text-danger shrink-0" />
                ) : diagnosis.category_label.includes("健康") || diagnosis.category === "normal_operation" ? (
                  <CheckCircle2 className="size-4 text-ok shrink-0" />
                ) : (
                  <AlertTriangle className="size-4 text-warn shrink-0" />
                )}
                <span className="text-ink font-semibold">{diagnosis.category_label}</span>
                <span className="rounded-full bg-brand/15 px-2 py-0.5 text-[10px] font-bold text-brand">
                  {t("docker.diagnose.confidence")}: {Math.round(diagnosis.confidence * 100)}%
                </span>
              </div>
              <p className="text-subtle leading-relaxed">{diagnosis.summary}</p>
            </div>

            <div className="space-y-1.5 rounded-lg bg-surface/70 border border-brand/10 p-3">
              <span className="font-semibold text-ink">{t("docker.diagnose.recommendation")}:</span>
              <p className="text-subtle leading-relaxed">{diagnosis.recommendation}</p>
            </div>
          </div>

          {/* 第二级：大语言模型专家处方按钮 */}
          <div className="pt-1 flex flex-wrap items-center justify-between gap-2 border-t border-brand/10">
            <span className="text-[11px] text-subtle">需要针对此容器的具体操作步骤和排查命令？</span>
            <button
              type="button"
              disabled={deepDiagnosing}
              onClick={() => void runDeepDiagnose()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-brand/40 bg-surface px-3 py-1.5 text-xs font-semibold text-brand shadow-2xs transition-all hover:bg-brand/10 active:scale-95 disabled:opacity-50"
            >
              <Bot className="size-3.5" />
              <span>{deepDiagnosing ? t("docker.diagnose.deepGenerating") : t("docker.diagnose.deepBtn")}</span>
            </button>
          </div>

          {/* 专家处方卡片 */}
          {prescription && (
            <div className="mt-3 rounded-xl border border-brand/40 bg-surface/90 p-4 space-y-3 text-ink animate-in fade-in duration-200">
              <div className="flex items-center justify-between border-b border-line/60 pb-2">
                <div className="flex items-center gap-2 font-semibold text-brand">
                  <Bot className="size-4 text-brand" />
                  <span>{t("docker.diagnose.deepTitle")}</span>
                </div>
                <span className="text-[11px] font-mono text-subtle">
                  模型: {prescription.model} · {prescription.latency_ms}ms
                </span>
              </div>

              <div className="space-y-1">
                <span className="text-xs font-semibold text-subtle uppercase tracking-wider">根本原因分析 (Root Cause)</span>
                <p className="text-xs text-ink leading-relaxed">{prescription.rootCause}</p>
              </div>

              {prescription.commands && prescription.commands.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-subtle uppercase tracking-wider">建议排查与修复指令</span>
                    {remediateResult && (
                      <span className={`text-[11px] font-medium ${remediateResult.ok ? "text-ok" : "text-danger"}`}>
                        {remediateResult.ok ? `✓ ${remediateResult.msg}` : `✕ ${remediateResult.msg}`}
                      </span>
                    )}
                  </div>
                  <div className="space-y-2">
                    {prescription.commands.map((cmd, idx) => (
                      <div key={idx} className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl border border-line bg-canvas/90 p-2.5 font-mono text-xs">
                        <pre className="overflow-x-auto whitespace-pre-wrap pr-2 text-ink">{cmd}</pre>
                        <div className="flex items-center gap-1 self-end sm:self-center shrink-0">
                          {canAct && !cmd.startsWith("#") && (
                            <button
                              type="button"
                              onClick={() => executeRemediation(cmd)}
                              disabled={remediating !== null}
                              className="inline-flex items-center gap-1 rounded-lg bg-brand/15 hover:bg-brand/25 text-brand px-2 py-1 font-sans text-[11px] font-medium transition-colors disabled:opacity-50"
                              title={t("docker.diagnose.autoRemediateBtn")}
                            >
                              <Sparkles className={`size-3 ${remediating === cmd ? "animate-spin" : ""}`} />
                              {remediating === cmd ? t("docker.diagnose.autoRemediating") : t("docker.diagnose.autoRemediateBtn")}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => copyCommand(cmd, idx)}
                            className="rounded p-1 text-subtle hover:bg-surface hover:text-ink transition-colors"
                            title={t("docker.diagnose.copyCmd")}
                          >
                            {copiedCmd === idx ? <Check className="size-3.5 text-ok" /> : <Copy className="size-3.5" />}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {prescription.explanation && (
                <div className="space-y-1 rounded bg-canvas/40 p-2.5 text-xs text-subtle leading-relaxed">
                  <span className="font-medium text-ink">深度机理说明：</span>
                  {prescription.explanation}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div
        ref={boxRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
        style={{ fontSize: font + "px" }}
        className="h-[55vh] overflow-auto rounded-md border border-line bg-canvas p-3 font-mono leading-relaxed"
      >
        {filtered.length === 0 ? (
          <p className="text-subtle">
            {lines.length === 0
              ? t("docker.logs.noLogs", { name: containerName })
              : t("docker.logs.noMatch")}
          </p>
        ) : (
          filtered.map((line, index) => (
            <div
              key={`${index}-${line.ts ?? ""}`}
              className={`whitespace-pre-wrap break-all ${
                line.stream === "stderr" ? "text-danger" : ""
              }`}
            >
              {line.ts && (
                <span className="mr-2 text-subtle">
                  {f.time(line.ts)}
                </span>
              )}
              <AnsiLine spans={parseAnsi(line.text)} />
            </div>
          ))
        )}
      </div>

      {paused && (
        <p className="text-[11px] text-warn">
          {t("docker.logs.paused")}
        </p>
      )}
    </div>
  );
}

function IconOnly({
  title,
  onClick,
  disabled,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className="rounded-md border border-line p-1.5 text-subtle transition-colors hover:border-brand hover:text-brand disabled:opacity-40"
    >
      {children}
    </button>
  );
}
