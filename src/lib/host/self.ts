import "server-only";

import os from "node:os";
import { getDockerProvider } from "@/lib/providers";

/**
 * Panelin kendi container'ı hakkında bilgi.
 *
 * Yedekleme motoru (M3.4) ve dosya yöneticisi (M3.5), panelin veri dizinini
 * BAŞKA bir container'a bağlamak zorunda: biri onu yedeklemek, diğeri oradan
 * host'a dosya kopyalamak için. İkisi de volume'ün gerçek adını bilmek
 * durumunda.
 *
 * Ad sabit yazılmıyor: compose proje adı (yani dizin adı) değişince volume adı
 * da değişir ve sabit yazılmış bir ad sessizce yanlış yeri gösterirdi.
 * Container içinde os.hostname() doğrudan container ID'yi verir.
 */

let resolvedName: string | null = null;

export function panelContainerName(): string {
  if (process.env.PANEL_CONTAINER_NAME) return process.env.PANEL_CONTAINER_NAME;
  if (resolvedName) return resolvedName;
  // Container içindeyken hostname container'ın short ID'sidir
  const host = os.hostname();
  if (host && /^[0-9a-f]{12,64}$/i.test(host)) {
    return host;
  }
  return "server-panel-panel-1";
}

let cached: { name: string | null; at: number } | null = null;
let cachedImage: { name: string | null; at: number } | null = null;
const CACHE_MS = 60_000;

/**
 * Panelin kendi imajının adı.
 *
 * Yükseltilmiş okuma (M3.5) bu imajı kullanıyor: içinde zaten Node var, ayrıca
 * bir imaj indirmek gerekmiyor ve sürümü panelinkiyle her zaman aynı.
 */
export async function panelImage(): Promise<string | null> {
  if (cachedImage && Date.now() - cachedImage.at < CACHE_MS) return cachedImage.name;

  try {
    const raw = (await getDockerProvider().inspectRaw(panelContainerName())) as {
      Name?: string;
      Config?: { Image?: string };
    } | null;
    if (raw?.Name) {
      resolvedName = raw.Name.replace(/^\//, "");
    }
    const name = raw?.Config?.Image ?? null;
    cachedImage = { name, at: Date.now() };
    return name;
  } catch {
    return null;
  }
}

/** `/app/data`'nın geldiği named volume; bulunamazsa null. */
export async function panelDataVolume(): Promise<string | null> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.name;

  try {
    const raw = (await getDockerProvider().inspectRaw(panelContainerName())) as {
      Name?: string;
      Mounts?: { Type?: string; Name?: string; Destination?: string }[];
    } | null;
    if (raw?.Name) {
      resolvedName = raw.Name.replace(/^\//, "");
    }

    const mount = raw?.Mounts?.find((entry) => entry.Destination === "/app/data");
    const name = mount?.Type === "volume" && mount.Name ? mount.Name : null;
    cached = { name, at: Date.now() };
    return name;
  } catch {
    return null;
  }
}

let cachedCaddy: { name: string; at: number } | null = null;

/**
 * Caddy container adı: ayarda belirtilen container varsa o kullanılır,
 * yoksa aynı compose projesindeki veya çalışan caddy container'ı otomatik çözümlenir.
 */
export async function resolveCaddyContainerName(preferredName?: string): Promise<string> {
  const preferred = preferredName?.trim() || "";
  const provider = getDockerProvider();

  if (preferred) {
    try {
      const inspect = await provider.inspect(preferred);
      if (inspect) return preferred;
    } catch {
      // Bulunamadıysa otomatik keşfe düş
    }
  }

  if (cachedCaddy && Date.now() - cachedCaddy.at < CACHE_MS) {
    return cachedCaddy.name;
  }

  try {
    const list = await provider.list(true);
    // 1. Aynı compose projesindeki caddy servisini ara
    const ownInspect = (await provider.inspectRaw(panelContainerName())) as {
      Config?: { Labels?: Record<string, string> };
    } | null;
    const project = ownInspect?.Config?.Labels?.["com.docker.compose.project"];

    if (project) {
      const composeCaddy = list.find(
        (c) =>
          c.labels["com.docker.compose.project"] === project &&
          (c.labels["com.docker.compose.service"] === "caddy" || c.name.includes("caddy")),
      );
      if (composeCaddy) {
        cachedCaddy = { name: composeCaddy.name, at: Date.now() };
        return composeCaddy.name;
      }
    }

    // 2. Çalışan caddy container'larını ara
    const anyCaddy = list.find((c) => c.image.includes("caddy") || c.name.includes("caddy"));
    if (anyCaddy) {
      cachedCaddy = { name: anyCaddy.name, at: Date.now() };
      return anyCaddy.name;
    }
  } catch {
    // Docker listeleme başarısızsa
  }

  return preferred || "server-panel-caddy-1";
}
