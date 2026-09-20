/**
 * Sunucu açılışında bir kez çalışır (dev ve production).
 *
 * Sıra önemli: önce şema, sonra ilk yönetici hesabı. Migration başarısız
 * olursa hata fırlatılır ve uygulama açılmaz — bozuk şemayla çalışmaktansa
 * açılmamak yeğdir (T11).
 *
 * Not: M0.6'da ayrı worker process gelince açılış sorumluluğu tek bir yere
 * taşınacak; iki process'in aynı anda migration denemesi yarış yaratır.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { masterKeyAvailable } = await import("@/lib/crypto");
  if (!masterKeyAvailable()) {
    const { randomBytes } = await import("node:crypto");
    const suggestion = randomBytes(32).toString("hex");
    throw new Error(
      "未配置 MASTER_KEY（T3：密钥加密密钥）。\n" +
        `.env 文件中加入：\n\n  MASTER_KEY=${suggestion}\n\n` +
        "请将此密钥单独保存在面板之外，不要放入备份。",
    );
  }

  const { runMigrations } = await import("@/lib/db/migrate");
  const result = runMigrations();

  if (result.applied.length > 0) {
    if (result.backupPath) {
      console.log(`[数据库] 迁移前备份：${result.backupPath}`);
    }
    console.log(
      `[数据库] 结构已升级：${result.from} → ${result.to}（已应用：${result.applied.join(", ")}）`,
    );
  } else {
    console.log(`[数据库] 结构已是最新版本：v${result.to}`);
  }

  // T9 — env tohumlaması migration'lardan SONRA, admin'den ÖNCE:
  // bootstrap ayarlardan okuyabilsin.
  const { seedFromEnv } = await import("@/lib/settings");
  const seeded = seedFromEnv();
  if (seeded.length > 0) {
    console.log(`[设置] 已从环境变量初始化：${seeded.join(", ")}`);
  }

  // Arayüz dili — tohumlamadan SONRA: dil env'den gelmiş olabilir.
  // Kütüphane kodu ve API uçları seçili dili yalnızca bu kayıt sayesinde
  // görebiliyor; yapılmazsa hepsi Türkçeye düşer (bkz. lib/i18n/runtime.ts).
  const { registerLocaleResolver } = await import("@/lib/i18n/server");
  registerLocaleResolver();

  const { bootstrapAdmin } = await import("@/lib/auth/bootstrap");
  bootstrapAdmin();

  const { pruneExpiredSessions } = await import("@/lib/auth/session");
  const pruned = pruneExpiredSessions();
  if (pruned > 0) console.log(`[认证] 已清理 ${pruned} 个过期会话`);

  // T10 — yalnızca MOCK_MODE'da: uzun dönem grafikleri ve katman seçimi
  // haftalarca veri beklemeden sınanabilsin diye geçmiş üretilir.
  const { seedMockHistory } = await import("@/lib/metrics/mock-history");
  const seededHistory = await seedMockHistory();
  if (seededHistory) console.log(`[指标] ${seededHistory}`);

  // T2 — arka plan işleri. Zamanlamalar ayarlardan okunur.
  const { startScheduler } = await import("@/lib/jobs/runner");
  startScheduler();

  /*
    M3.32 — Docker olay akışı. Zamanlanmış bir iş DEĞİL, uzun ömürlü bir
    abonelik: Docker olayları oluştukça yazıyor ve periyodik yoklama hem
    gecikme hem de iki tur arasında olay kaçırma riski demek olurdu.

    Bağlantı kurulamazsa yalnızca günlüğe yazıyor; panel açılmaya devam
    ediyor. Olay akışı panelin çalışma koşulu değil.
  */
  const { startDockerEvents } = await import("@/lib/docker/events");
  startDockerEvents();
}
