import { CloudOff, Globe, TriangleAlert } from "lucide-react";
import type { InternetStatus } from "@/lib/home/internet";
import { getT } from "@/lib/i18n/server";

/**
 * M2.7 — ev halkı için büyük gösterge.
 *
 * Üç ayrı durum var ve üçü de farklı bir cevap gerektiriyor:
 *   - internet yok            → modem/hat sorunu, panelin yapabileceği bir şey yok
 *   - internet var, servis çökük → sunucuda bir sorun var
 *   - her şey çalışıyor        → sorun senin cihazında
 *
 * Bu ayrım yapılmasaydı ev halkı her arızada aynı şeyi görür ve her seferinde
 * aynı soruyu sorardı.
 */
export function InternetIndicator({
  status,
  big = false,
}: {
  status: InternetStatus;
  big?: boolean;
}) {
  const t = getT();
  const broken = status.servicesDown > 0;

  const view = !status.online
    ? {
        Icon: CloudOff,
        tone: "text-danger",
        ring: "border-danger/40 bg-danger/5",
        title: t("home.internet.offline"),
        detail: t("home.internet.offlineDetail"),
      }
    : broken
      ? {
          Icon: TriangleAlert,
          tone: "text-warn",
          ring: "border-warn/40 bg-warn/5",
          title: t("home.internet.degraded"),
          detail: t("home.internet.degradedDetail", { count: status.servicesDown }),
        }
      : {
          Icon: Globe,
          tone: "text-ok",
          ring: "border-ok/40 bg-ok/5",
          title: t("home.internet.ok"),
          detail:
            status.servicesTotal > 0
              ? t("home.internet.okDetail", { count: status.servicesTotal })
              : t("home.internet.okSimple"),
        };

  return (
    <div className={`flex items-center gap-4 rounded-2xl border p-5 shadow-xs backdrop-blur-md transition-all duration-300 ${view.ring}`}>
      <div className={`flex shrink-0 items-center justify-center rounded-2xl p-3 ${!status.online ? "bg-danger/10" : broken ? "bg-warn/10" : "bg-ok/10"}`}>
        <view.Icon className={`${view.tone} ${big ? "size-12" : "size-6"}`} aria-hidden />
      </div>
      <div className="min-w-0">
        <div className={`font-semibold tracking-tight ${view.tone} ${big ? "text-2xl" : "text-base"}`}>
          {view.title}
        </div>
        <p className={`text-subtle leading-relaxed ${big ? "mt-1 text-sm" : "mt-0.5 text-xs"}`}>{view.detail}</p>
      </div>
    </div>
  );
}
