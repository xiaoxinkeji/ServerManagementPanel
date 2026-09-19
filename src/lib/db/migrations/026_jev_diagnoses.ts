import type { Migration } from "./types";

/**
 * Jev 诊断历史表 (AI Engine v2)。
 *
 * 每次 Jev 容器诊断（手动一键诊断或自愈引擎触发）落一行，
 * 供 AI 工作台展示近期诊断记录与分类统计。行数上限由
 * `ai.jev.history_keep` 设置控制，由 history.ts 在写入后裁剪。
 */
export const migration026: Migration = {
  version: 26,
  name: "jev_diagnoses",
  up: `
CREATE TABLE jev_diagnoses (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  ts             INTEGER NOT NULL DEFAULT (unixepoch()),
  container_id   TEXT    NOT NULL DEFAULT '',
  container_name TEXT    NOT NULL,
  -- 'manual' = 面板手动诊断 | 'autoheal' = 自愈引擎触发
  trigger        TEXT    NOT NULL DEFAULT 'manual',
  category       TEXT    NOT NULL,
  confidence     REAL    NOT NULL,
  is_fatal       INTEGER NOT NULL DEFAULT 0,
  can_autoheal   INTEGER NOT NULL DEFAULT 0,
  source         TEXT    NOT NULL,
  latency_ms     INTEGER NOT NULL DEFAULT 0,
  summary        TEXT    NOT NULL DEFAULT '',
  evidence       TEXT    NOT NULL DEFAULT '[]'
);

CREATE INDEX jev_diagnoses_ts ON jev_diagnoses(ts);
CREATE INDEX jev_diagnoses_container ON jev_diagnoses(container_name, ts);
`,
};
