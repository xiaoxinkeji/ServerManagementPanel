"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

import { useT } from "@/lib/i18n/client";

/**
 * Basit modal — `<dialog>` üzerine kurulu.
 *
 * Tarayıcının kendi öğesi kullanılıyor çünkü odak tuzağı (focus trap), Esc ile
 * kapatma ve arka planın erişilemez olması bedava geliyor; elle yazılan bir
 * modal bunları neredeyse her zaman eksik yapar.
 *
 * ORTALAMA `globals.css`'teki `dialog { margin: auto }` kuralından geliyor,
 * tarayıcıdan bedava DEĞİL: Tailwind v4 preflight'ı margin'i evrensel
 * seçiciyle sıfırladığı için tarayıcının kendi kuralı ölüyor ve kutu sol üst
 * köşeye yapışıyor. Gerekçesi orada yazılı.
 *
 * `sm` altında alttan açılan bir yaprağa (bottom sheet) dönüşür: ortada duran
 * dar bir kutu yerine alta yaslanmış tam genişlik — hem başparmağa yakın hem
 * de klavye açılınca yukarı itilen alan doğal görünüyor. Bunun için `mt-auto`
 * + `mb-0` veriliyor; üstteki otomatik boşluk kutuyu aşağı itiyor. `m-0`
 * yazmak ortalamayı büsbütün kaldırırdı.
 */
export function Modal({
  open,
  title,
  onClose,
  children,
  wide = false,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const t = useT();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        // Yalnızca arka plana (dialog öğesinin kendisine) tıklanırsa kapan.
        if (e.target === ref.current) onClose();
      }}
      className={`w-[calc(100%-2rem)] rounded-3xl border border-line/60 bg-surface/90 shadow-2xl backdrop-blur-2xl p-0 text-ink backdrop:bg-black/50 backdrop:backdrop-blur-sm max-sm:mb-0 max-sm:mt-auto max-sm:w-full max-sm:max-w-none max-sm:rounded-b-none max-sm:rounded-t-3xl max-sm:border-x-0 max-sm:border-b-0 ${
        wide ? "max-w-4xl" : "max-w-xl"
      }`}
    >
      {open && (
        <div className="max-h-[85dvh] overflow-y-auto overscroll-contain">
          <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-line/40 bg-surface/90 backdrop-blur-md px-6 py-4">
            <h2 className="min-w-0 truncate font-semibold tracking-tight text-base text-ink">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label={t("common.actions.close")}
              className="-mr-1 flex size-7 shrink-0 items-center justify-center rounded-full bg-canvas/80 text-subtle transition-all hover:bg-canvas hover:text-ink active:scale-95 shadow-2xs"
            >
              <X className="size-3.5" />
            </button>
          </div>
          <div className="px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5">{children}</div>
        </div>
      )}
    </dialog>
  );
}
