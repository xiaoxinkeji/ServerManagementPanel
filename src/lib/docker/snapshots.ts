/**
 * 卷快照与轻量备份辅助命名规范
 */
export const SNAPSHOT_PREFIX = "snap_";

export interface SnapshotMeta {
  sourceVolume: string;
  timestamp: number;
  formattedDate: string;
}

/**
 * 为指定卷生成快照名称：snap_{volumeName}_{timestamp}
 */
export function generateSnapshotVolumeName(volumeName: string, now = Date.now()): string {
  const cleanName = volumeName.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 32);
  return `${SNAPSHOT_PREFIX}${cleanName}_${now}`;
}

/**
 * 判断一个卷名是否是快照卷
 */
export function isSnapshotVolume(volumeName: string): boolean {
  return volumeName.startsWith(SNAPSHOT_PREFIX);
}

/**
 * 从快照卷名解析源卷名与创建时间戳
 */
export function parseSnapshotVolumeName(snapshotName: string): SnapshotMeta | null {
  if (!isSnapshotVolume(snapshotName)) return null;
  const match = /^snap_(.+)_(\d+)$/.exec(snapshotName);
  if (!match) return null;

  const timestamp = parseInt(match[2], 10);
  return {
    sourceVolume: match[1],
    timestamp,
    formattedDate: new Date(timestamp).toISOString(),
  };
}
