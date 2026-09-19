import "server-only";

import { statSync } from "node:fs";
import { dbPath, getDb } from "./client";
import { currentVersion, migrationBackupBytes } from "./migrate";

export type DbStatus = {
  schemaVersion: number;
  journalMode: string;
  sizeBytes: number;
  integrityOk: boolean;
  hostCount: number;
  /** Migration öncesi kopyaların kapladığı yer — sessizce büyüyebiliyor. */
  backupBytes: number;
};

let cachedIntegrity: { ok: boolean; at: number } | null = null;
const INTEGRITY_CACHE_MS = 60_000;

/** /api/health ve ileride Panel İşleri ekranı için özet. */
export function dbStatus(): DbStatus {
  const db = getDb();

  const journal = db.prepare("PRAGMA journal_mode").get() as {
    journal_mode: string;
  };

  let integrityOk = true;
  if (cachedIntegrity && Date.now() - cachedIntegrity.at < INTEGRITY_CACHE_MS) {
    integrityOk = cachedIntegrity.ok;
  } else {
    const integrity = db.prepare("PRAGMA quick_check").get() as {
      quick_check: string;
    };
    integrityOk = integrity?.quick_check === "ok";
    cachedIntegrity = { ok: integrityOk, at: Date.now() };
  }

  const hosts = db.prepare("SELECT COUNT(*) AS n FROM hosts").get() as { n: number };

  let sizeBytes = 0;
  try {
    sizeBytes = statSync(dbPath()).size;
  } catch {
    /* dosya henüz yoksa 0 kalsın */
  }

  return {
    schemaVersion: currentVersion(),
    journalMode: journal.journal_mode,
    sizeBytes,
    integrityOk,
    hostCount: hosts.n,
    backupBytes: migrationBackupBytes(),
  };
}
