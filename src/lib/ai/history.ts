import "server-only";

import { getDb } from "@/lib/db/client";
import { getNumber } from "@/lib/settings";
import type { ContainerDiagnosisResult } from "./jev";

/** Jev 诊断历史记录存取（AI Engine v2）。 */

export interface JevDiagnosisRecord {
  id: number;
  ts: number;
  containerId: string;
  containerName: string;
  trigger: "manual" | "autoheal";
  category: string;
  confidence: number;
  isFatal: boolean;
  canAutoheal: boolean;
  source: string;
  latencyMs: number;
  summary: string;
  evidence: string[];
}

type Row = {
  id: number;
  ts: number;
  container_id: string;
  container_name: string;
  trigger: string;
  category: string;
  confidence: number;
  is_fatal: number;
  can_autoheal: number;
  source: string;
  latency_ms: number;
  summary: string;
  evidence: string;
};

function toRecord(row: Row): JevDiagnosisRecord {
  let evidence: string[] = [];
  try {
    const parsed = JSON.parse(row.evidence);
    if (Array.isArray(parsed)) evidence = parsed.filter((x) => typeof x === "string");
  } catch {
    // 忽略损坏的 JSON 证据列
  }
  return {
    id: row.id,
    ts: row.ts,
    containerId: row.container_id,
    containerName: row.container_name,
    trigger: row.trigger === "autoheal" ? "autoheal" : "manual",
    category: row.category,
    confidence: row.confidence,
    isFatal: row.is_fatal === 1,
    canAutoheal: row.can_autoheal === 1,
    source: row.source,
    latencyMs: row.latency_ms,
    summary: row.summary,
    evidence,
  };
}

/**
 * 写入一条诊断记录，并按 `ai.jev.history_keep` 裁剪掉最旧的行。
 */
export function recordDiagnosis(input: {
  containerId: string;
  containerName: string;
  trigger: "manual" | "autoheal";
  diagnosis: ContainerDiagnosisResult;
}): void {
  const d = input.diagnosis;
  getDb()
    .prepare(
      `INSERT INTO jev_diagnoses
         (container_id, container_name, trigger, category, confidence,
          is_fatal, can_autoheal, source, latency_ms, summary, evidence)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.containerId,
      input.containerName,
      input.trigger,
      d.category,
      d.confidence,
      d.is_fatal ? 1 : 0,
      d.can_autoheal ? 1 : 0,
      d.source,
      d.latency_ms,
      d.summary,
      JSON.stringify(d.evidence ?? []),
    );

  const keep = Math.max(1, getNumber("ai.jev.history_keep") || 500);
  getDb()
    .prepare(
      `DELETE FROM jev_diagnoses WHERE id NOT IN
         (SELECT id FROM jev_diagnoses ORDER BY ts DESC, id DESC LIMIT ?)`,
    )
    .run(keep);
}

export function listDiagnoses(opts?: {
  limit?: number;
  containerName?: string;
}): JevDiagnosisRecord[] {
  const clauses: string[] = [];
  const params: (string | number)[] = [];

  if (opts?.containerName) {
    clauses.push("container_name = ?");
    params.push(opts.containerName);
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  const limit = Math.min(Math.max(opts?.limit ?? 100, 1), 500);

  return (
    getDb()
      .prepare(`SELECT * FROM jev_diagnoses ${where} ORDER BY ts DESC, id DESC LIMIT ?`)
      .all(...params, limit) as Row[]
  ).map(toRecord);
}

/** 近 7 天诊断统计。 */
export function diagnosisStats(): {
  total: number;
  fatal: number;
  byCategory: Record<string, number>;
} {
  const cutoff = Math.floor(Date.now() / 1000) - 7 * 86400;
  const rows = getDb()
    .prepare(
      `SELECT category, COUNT(*) AS n, SUM(is_fatal) AS fatal
       FROM jev_diagnoses WHERE ts >= ? GROUP BY category`,
    )
    .all(cutoff) as { category: string; n: number; fatal: number | null }[];

  const byCategory: Record<string, number> = {};
  let total = 0;
  let fatal = 0;
  for (const row of rows) {
    byCategory[row.category] = row.n;
    total += row.n;
    fatal += row.fatal ?? 0;
  }
  return { total, fatal, byCategory };
}
