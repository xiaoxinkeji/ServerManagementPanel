"use client";

import { useCallback, useEffect, useState } from "react";
import { Camera, ChevronRight, Download, File as FileIcon, Folder, Home, Link2, RotateCcw, Trash2 } from "lucide-react";
import { CSRF_COOKIE, CSRF_HEADER } from "@/lib/auth/types";

import { formatBytes } from "@/lib/metrics/catalog";
import type { FileEntry } from "@/lib/docker/listing";
import { useT } from "@/lib/i18n/client";
import { Rich } from "@/lib/i18n/rich";

/**
 * Volume içi dosya tarayıcı (M3.44).
 *
 * İlk sürüm (M3.40) yalnızca kök dizini listeliyordu — bu bilinçli bir sınırdı
 * ama pratikte yetmedi: bir volume'ün ne taşıdığını anlamak için neredeyse her
 * zaman bir alt dizine girmek gerekiyor (`/data/db`, `/config`…). Artık
 * gezinilebilir ve dosyalar indirilebiliyor.
 *
 * Container dosya tarayıcısıyla (M3.23) aynı davranış ve aynı `parseListing`
 * çıktısı; ayrı bir bileşen olmasının sebebi veri yolunun farklı olması —
 * container'da `exec`, volume'de tek seferlik bir container.
 *
 * ⚠️ **Salt okunur.** Yazma bilerek yok: volume, container'ın dosya
 * sisteminden farklı olarak KALICI veri ve çoğu zaman bir veritabanının canlı
 * dosyaları. Çalışan bir Postgres'in altından dosya düzenlemek, kurtarılamayan
 * bir bozulma demek. İçeriği değiştirmek gerekiyorsa doğru yol container'ın
 * kendi dosya sekmesi (uygulama orada dosyayı kilitliyor ve tutarlılığı
 * biliyor).
 */

type Listing = { ok: true; path: string; entries: FileEntry[] } | { ok: false; message: string };

export function VolumeBrowser({ volume, canAct }: { volume: string; canAct: boolean }) {
  const t = useT();
  const [cwd, setCwd] = useState("/");
  const [entries, setEntries] = useState<FileEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 快照相关状态
  const [snapshots, setSnapshots] = useState<{
    name: string;
    createdAt: number;
    formattedDate: string;
  }[]>([]);
  const [snapLoading, setSnapLoading] = useState(false);
  const [snapFeedback, setSnapFeedback] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/docker/volumes/snapshots?volume=${encodeURIComponent(volume)}`);
        if (res.ok && active) {
          const data = await res.json();
          setSnapshots(data.snapshots || []);
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      active = false;
    };
  }, [volume]);

  async function reloadSnapshots() {
    try {
      const res = await fetch(`/api/docker/volumes/snapshots?volume=${encodeURIComponent(volume)}`);
      if (res.ok) {
        const data = await res.json();
        setSnapshots(data.snapshots || []);
      }
    } catch {
      // ignore
    }
  }

  async function createSnapshot() {
    if (!canAct) return;
    setSnapLoading(true);
    setSnapFeedback(null);
    try {
      const match = document.cookie.match(new RegExp(`(?:^|; )${CSRF_COOKIE}=([^;]*)`));
      const csrf = match ? decodeURIComponent(match[1]) : "";
      const res = await fetch("/api/docker/volumes/snapshots", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [CSRF_HEADER]: csrf,
        },
        body: JSON.stringify({ action: "create", volume }),
      });
      const data = await res.json();
      if (res.ok) {
        setSnapFeedback(t("docker.volumes.snapshotSuccess"));
        await reloadSnapshots();
      } else {
        alert(data.error || "Snapshot failed");
      }
    } catch {
      alert(t("common.errors.network"));
    } finally {
      setSnapLoading(false);
    }
  }

  async function restoreSnapshot(snapshotName: string) {
    if (!canAct) return;
    if (!window.confirm(`${t("docker.volumes.snapshotRestoreBtn")} ${snapshotName}?`)) return;
    setSnapLoading(true);
    setSnapFeedback(null);
    try {
      const match = document.cookie.match(new RegExp(`(?:^|; )${CSRF_COOKIE}=([^;]*)`));
      const csrf = match ? decodeURIComponent(match[1]) : "";
      const res = await fetch("/api/docker/volumes/snapshots", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [CSRF_HEADER]: csrf,
        },
        body: JSON.stringify({ action: "restore", volume, snapshot: snapshotName }),
      });
      const data = await res.json();
      if (res.ok) {
        setSnapFeedback(t("docker.volumes.snapshotRestoreSuccess"));
        // 刷新文件列表
        setCwd("/");
      } else {
        alert(data.error || "Restore failed");
      }
    } catch {
      alert(t("common.errors.network"));
    } finally {
      setSnapLoading(false);
    }
  }

  async function deleteSnapshot(snapshotName: string) {
    if (!canAct) return;
    if (!window.confirm(`${t("docker.volumes.snapshotDelete")} ${snapshotName}?`)) return;
    try {
      const match = document.cookie.match(new RegExp(`(?:^|; )${CSRF_COOKIE}=([^;]*)`));
      const csrf = match ? decodeURIComponent(match[1]) : "";
      const res = await fetch(`/api/docker/volumes/snapshots?snapshot=${encodeURIComponent(snapshotName)}`, {
        method: "DELETE",
        headers: { [CSRF_HEADER]: csrf },
      });
      if (res.ok) {
        await reloadSnapshots();
      }
    } catch {
      alert(t("common.errors.network"));
    }
  }

  /*
    Durum yazan her şey effect'ten AYRI bir callback'te: setState'i effect
    gövdesinde doğrudan çağırmak zincirleme render üretiyor ve eslint kuralı
    buna izin vermiyor. Aynı desen dosya tarayıcıda ve compose üretme
    sekmesinde de var.
  */
  const apply = useCallback((payload: Listing | null) => {
    if (payload === null) {
      setBusy(true);
      return;
    }
    setBusy(false);
    if (payload.ok) {
      setEntries(payload.entries);
      setError(null);
    } else {
      setError(payload.message);
      setEntries(null);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      apply(null);
      try {
        const response = await fetch(
          `/api/docker/resources?detail=volume-files&id=${encodeURIComponent(volume)}&path=${encodeURIComponent(cwd)}`,
          { cache: "no-store", signal: controller.signal },
        );
        const payload = (await response.json()) as Listing;
        if (!controller.signal.aborted) apply(payload);
      } catch (fetchError) {
        if ((fetchError as Error)?.name !== "AbortError") {
          apply({ ok: false, message: t("common.errors.network") });
        }
      }
    })();

    return () => controller.abort();
  }, [volume, cwd, apply, t]);

  // Kırıntı yolu: her parça tıklanabilir, böylece üç dizin yukarı çıkmak için
  // "yukarı" düğmesine üç kez basmak gerekmiyor.
  const parcalar = cwd === "/" ? [] : cwd.slice(1).split("/");

  return (
    <div className="space-y-3">
      {/* 顶部快照管理控制区 */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface/40 p-2.5 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void createSnapshot()}
            disabled={snapLoading || !canAct}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand/15 hover:bg-brand/25 text-brand px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
          >
            <Camera className={`size-3.5 ${snapLoading ? "animate-spin" : ""}`} />
            <span>{snapLoading ? t("docker.volumes.snapshotCreating") : t("docker.volumes.snapshotBtn")}</span>
          </button>
          {snapFeedback && <span className="text-xs text-ok font-medium">✓ {snapFeedback}</span>}
        </div>

        {snapshots.length > 0 && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-subtle">历史快照 ({snapshots.length}):</span>
            <div className="flex items-center gap-1 overflow-x-auto max-w-sm py-0.5">
              {snapshots.slice(0, 3).map((snap) => (
                <div
                  key={snap.name}
                  className="inline-flex items-center gap-1 rounded-md border border-line bg-canvas px-2 py-0.5 font-mono text-[11px]"
                >
                  <span className="truncate max-w-[100px]" title={snap.name}>
                    {new Date(snap.createdAt).toLocaleTimeString()}
                  </span>
                  {canAct && (
                    <>
                      <button
                        type="button"
                        onClick={() => void restoreSnapshot(snap.name)}
                        disabled={snapLoading}
                        title={t("docker.volumes.snapshotRestoreBtn")}
                        className="text-subtle hover:text-brand transition-colors"
                      >
                        <RotateCcw className="size-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteSnapshot(snap.name)}
                        title={t("docker.volumes.snapshotDelete")}
                        className="text-subtle hover:text-danger transition-colors"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1 text-xs">
        <button
          type="button"
          onClick={() => setCwd("/")}
          className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-subtle transition-colors hover:text-brand"
        >
          <Home className="size-3" aria-hidden />
          {volume}
        </button>

        {parcalar.map((parca, index) => (
          <span key={`${parca}-${index}`} className="flex items-center gap-1">
            <ChevronRight className="size-3 text-subtle" aria-hidden />
            <button
              type="button"
              onClick={() => setCwd("/" + parcalar.slice(0, index + 1).join("/"))}
              className="rounded px-1 py-0.5 font-mono transition-colors hover:text-brand"
            >
              {parca}
            </button>
          </span>
        ))}

        {busy && <span className="ml-2 text-subtle">{t("common.states.loadingInline")}</span>}
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}

      {entries && (
        <div className="max-h-72 overflow-auto rounded-md border border-line">
          {entries.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-subtle">{t("docker.files.emptyDir")}</p>
          ) : (
            <ul className="divide-y divide-line">
              {entries.map((entry) => {
                const dizin = entry.type === "dizin";
                const bag = entry.type === "sembolik";

                return (
                  <li
                    key={entry.path}
                    className="flex items-center gap-2 px-3 py-1.5 text-[11px] hover:bg-line/30"
                  >
                    {dizin ? (
                      <Folder className="size-3.5 shrink-0 text-brand" aria-hidden />
                    ) : bag ? (
                      <Link2 className="size-3.5 shrink-0 text-subtle" aria-hidden />
                    ) : (
                      <FileIcon className="size-3.5 shrink-0 text-subtle" aria-hidden />
                    )}

                    {dizin ? (
                      <button
                        type="button"
                        onClick={() => setCwd(entry.path)}
                        className="min-w-0 flex-1 truncate text-left font-mono transition-colors hover:text-brand"
                      >
                        {entry.name}
                      </button>
                    ) : (
                      <span className="min-w-0 flex-1 truncate font-mono" title={entry.name}>
                        {entry.name}
                        {bag && entry.linkTarget && (
                          <span className="text-subtle"> → {entry.linkTarget}</span>
                        )}
                      </span>
                    )}

                    <span className="shrink-0 font-mono text-subtle">{entry.permissions}</span>
                    <span className="w-24 shrink-0 truncate text-subtle" title={entry.owner}>
                      {entry.owner}
                    </span>
                    <span className="w-16 shrink-0 text-right font-mono text-subtle">
                      {entry.type === "dosya" ? formatBytes(entry.size) : "—"}
                    </span>

                    {/*
                      İndirme bir `<a>`: tarayıcının indirme akışına bağlanmanın
                      tek yolu bu. Yalnızca gerçek dosyalarda — dizin ve
                      sembolik bağda indirilecek bir gövde yok.
                    */}
                    {canAct && entry.type === "dosya" ? (
                      <a
                        href={`/api/docker/resources?detail=volume-file&id=${encodeURIComponent(volume)}&path=${encodeURIComponent(entry.path)}`}
                        title={t("docker.volumeBrowser.download", { name: entry.name })}
                        aria-label={t("docker.volumeBrowser.download", { name: entry.name })}
                        className="shrink-0 rounded p-1 text-subtle transition-colors hover:text-brand"
                      >
                        <Download className="size-3" aria-hidden />
                      </a>
                    ) : (
                      <span className="w-5 shrink-0" />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      <p className="text-[11px] text-subtle">
        <Rich
          text={t("docker.volumeBrowser.note")}
          values={{ tab: <strong>{t("docker.drawer.tab.dosyalar")}</strong> }}
        />
      </p>
    </div>
  );
}
