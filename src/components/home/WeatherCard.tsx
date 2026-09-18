import { CloudRain, CloudSnow, Cloudy, Sun, Zap } from "lucide-react";
import type { Weather } from "@/lib/home/weather";
import { getT } from "@/lib/i18n/server";

/**
 * İkonu BİLEŞEN olarak değil, hazır ELEMAN olarak döndürüyor.
 *
 * `const Icon = icon(code)` biçimi render sırasında bileşen üretmek sayılıyor
 * (react-hooks/static-components): React her render'da yeni bir bileşen türü
 * görür ve alt ağacın durumunu sıfırlar.
 */
function WeatherIcon({ code, className }: { code: number; className: string }) {
  if (code === 0 || code <= 2) return <Sun className={className} aria-hidden />;
  if (code <= 48) return <Cloudy className={className} aria-hidden />;
  if (code <= 67 || (code >= 80 && code <= 82))
    return <CloudRain className={className} aria-hidden />;
  if (code <= 86) return <CloudSnow className={className} aria-hidden />;
  return <Zap className={className} aria-hidden />;
}

/** M2.7 — hava durumu kutusu. */
export function WeatherCard({
  weather,
  label,
  big = false,
}: {
  weather: Weather;
  label: string;
  big?: boolean;
}) {
  const t = getT();
  return (
    <div className="flex items-center gap-3.5 rounded-xl border border-line/60 bg-canvas/40 px-4 py-2.5 shadow-2xs">
      <WeatherIcon
        code={weather.code}
        className={`shrink-0 text-brand ${big ? "size-12" : "size-7"}`}
      />
      <div className="min-w-0">
        <div className={`font-semibold tracking-tight tabular-nums ${big ? "text-4xl" : "text-2xl"}`}>
          {Math.round(weather.temperature)}°
        </div>
        <div className={`text-subtle font-medium ${big ? "text-base" : "text-xs"}`}>
          {weather.description}
          {label && ` · ${label}`}
        </div>
        <div className={`text-subtle/80 ${big ? "text-sm" : "text-[11px]"}`}>
          {/* Hissedilen ayrı yazılıyor: rüzgârlı bir günde 12° ile 6° arasındaki
              fark, dışarı çıkarken giyilecek şeyi değiştiriyor. */}
          {t("home.weather.detail", {
            apparent: Math.round(weather.apparent),
            max: Math.round(weather.max),
            min: Math.round(weather.min),
          })}
        </div>
      </div>
    </div>
  );
}
