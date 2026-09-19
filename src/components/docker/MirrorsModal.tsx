"use client";

import { useEffect, useState } from "react";
import { Check, Gauge, Globe, Loader2, RefreshCw, Server, X } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { readCsrfToken } from "./detail/shared";
import { CSRF_HEADER } from "@/lib/auth/types";

export function MirrorsModal({
  open,
  onClose,
  canAct,
}: {
  open: boolean;
  onClose: () => void;
  canAct: boolean;
}) {
  const t = useT();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<Record<string, { testing: boolean; latency?: number; ok?: boolean }>>({});
  const [presets, setPresets] = useState<Array<{ name: string; url: string }>>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [customInput, setCustomInput] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setMessage(null);
    fetch("/api/docker/mirrors")
      .then((r) => r.json())
      .then((data) => {
        setPresets(data.presets || []);
        setSelected(data.currentMirrors || []);
      })
      .catch(() => {
        setMessage({ ok: false, text: t("common.errors.network") });
      })
      .finally(() => setLoading(false));
  }, [open, t]);

  async function testLatency(url: string) {
    setTesting((prev) => ({ ...prev, [url]: { testing: true } }));
    try {
      const res = await fetch(`/api/docker/mirrors?testUrl=${encodeURIComponent(url)}`);
      const data = await res.json();
      setTesting((prev) => ({
        ...prev,
        [url]: { testing: false, latency: data.durationMs, ok: data.ok },
      }));
    } catch {
      setTesting((prev) => ({
        ...prev,
        [url]: { testing: false, ok: false },
      }));
    }
  }

  function toggleMirror(url: string) {
    setSelected((prev) =>
      prev.includes(url) ? prev.filter((u) => u !== url) : [...prev, url]
    );
  }

  function addCustom() {
    const val = customInput.trim();
    if (!val || !/^https?:\/\//i.test(val)) return;
    if (!selected.includes(val)) {
      setSelected((prev) => [...prev, val]);
    }
    setCustomInput("");
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/docker/mirrors", {
        method: "POST",
        headers: { "content-type": "application/json", [CSRF_HEADER]: readCsrfToken() },
        body: JSON.stringify({ mirrors: selected }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ ok: true, text: t("docker.mirrors.saved") });
        setTimeout(() => onClose(), 1500);
      } else {
        setMessage({ ok: false, text: data.error || "Save failed" });
      }
    } catch {
      setMessage({ ok: false, text: t("common.errors.network") });
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="flex w-full max-w-xl flex-col rounded-2xl border border-line bg-surface shadow-xl max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="flex items-center gap-2">
            <Globe className="size-5 text-brand" />
            <h2 className="text-base font-semibold">{t("docker.mirrors.title")}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-subtle transition-colors hover:bg-canvas hover:text-ink"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-sm">
          <p className="text-xs text-subtle leading-relaxed">
            {t("docker.mirrors.help")}
          </p>

          {message && (
            <div
              className={`rounded-lg p-3 text-xs ${
                message.ok ? "bg-ok/10 text-ok border border-ok/20" : "bg-danger/10 text-danger border border-danger/20"
              }`}
            >
              {message.text}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12 text-subtle gap-2">
              <Loader2 className="size-5 animate-spin text-brand" />
              <span>{t("common.states.loading")}</span>
            </div>
          ) : (
            <>
              {/* Presets List */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-subtle">
                  <span>{t("docker.mirrors.presetTitle")}</span>
                </div>
                <div className="space-y-1.5">
                  {presets.map((preset) => {
                    const isChecked = selected.includes(preset.url);
                    const test = testing[preset.url];
                    return (
                      <div
                        key={preset.url}
                        className={`flex items-center justify-between rounded-xl border p-3 transition-all ${
                          isChecked
                            ? "border-brand/60 bg-brand/5 shadow-2xs"
                            : "border-line bg-canvas/30 hover:bg-canvas"
                        }`}
                      >
                        <label className="flex items-center gap-3 cursor-pointer min-w-0 flex-1">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleMirror(preset.url)}
                            className="size-4 rounded border-line text-brand focus:ring-brand accent-brand"
                          />
                          <div className="min-w-0">
                            <div className="font-medium truncate">{preset.name}</div>
                            <div className="text-xs text-subtle font-mono truncate">{preset.url}</div>
                          </div>
                        </label>

                        <div className="flex items-center gap-2 shrink-0 ml-3">
                          {test && (
                            <span
                              className={`text-xs font-mono font-medium ${
                                test.testing
                                  ? "text-subtle"
                                  : test.ok
                                    ? "text-ok"
                                    : "text-danger"
                              }`}
                            >
                              {test.testing ? "..." : test.ok ? `${test.latency}ms` : "超时"}
                            </span>
                          )}
                          <button
                            type="button"
                            disabled={test?.testing}
                            onClick={() => void testLatency(preset.url)}
                            title={t("docker.mirrors.testLatency")}
                            className="rounded-lg p-1.5 text-subtle hover:bg-line/40 hover:text-ink transition-colors"
                          >
                            <Gauge className="size-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Custom Mirror Input */}
              <div className="space-y-2 pt-2 border-t border-line">
                <span className="text-xs font-semibold uppercase tracking-wider text-subtle">
                  {t("docker.mirrors.customTitle")}
                </span>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={customInput}
                    onChange={(e) => setCustomInput(e.target.value)}
                    placeholder="https://your-custom-mirror.example.com"
                    className="flex-1 rounded-xl border border-line bg-canvas px-3 py-2 text-xs font-mono outline-none focus:border-brand"
                  />
                  <button
                    type="button"
                    onClick={addCustom}
                    className="rounded-xl border border-line bg-surface px-4 py-2 text-xs font-medium hover:border-brand hover:text-brand transition-colors"
                  >
                    {t("common.actions.add")}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-line px-5 py-4 bg-canvas/30 rounded-b-2xl">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-line px-4 py-2 text-xs font-medium text-subtle hover:bg-canvas hover:text-ink transition-colors"
          >
            {t("common.actions.cancel")}
          </button>
          <button
            type="button"
            disabled={!canAct || saving || loading}
            onClick={() => void save()}
            className="flex items-center gap-2 rounded-xl bg-brand px-5 py-2 text-xs font-medium text-white shadow-xs hover:bg-brand/90 transition-all active:scale-95 disabled:opacity-50"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            {t("common.actions.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
