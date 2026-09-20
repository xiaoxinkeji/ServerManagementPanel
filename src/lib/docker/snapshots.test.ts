import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  generateSnapshotVolumeName,
  isSnapshotVolume,
  parseSnapshotVolumeName,
  SNAPSHOT_PREFIX,
} from "./snapshots.ts";

describe("Volume Snapshot Naming and Metadata Engine", () => {
  it("generates valid snapshot volume name with prefix and timestamp", () => {
    const fixedTime = 1710000000000;
    const name = generateSnapshotVolumeName("my_data_volume", fixedTime);
    assert.equal(name, `${SNAPSHOT_PREFIX}my_data_volume_${fixedTime}`);
    assert.equal(isSnapshotVolume(name), true);
  });

  it("sanitizes invalid characters in source volume name", () => {
    const name = generateSnapshotVolumeName("dirty/name:with*chars", 123456);
    assert.equal(name, `${SNAPSHOT_PREFIX}dirty_name_with_chars_123456`);
  });

  it("correctly identifies whether a volume is a snapshot", () => {
    assert.equal(isSnapshotVolume("snap_postgres_data_123"), true);
    assert.equal(isSnapshotVolume("postgres_data"), false);
    assert.equal(isSnapshotVolume("normal_volume_snap"), false);
  });

  it("parses source volume name and timestamp accurately", () => {
    const parsed = parseSnapshotVolumeName("snap_redis_data_1710000000000");
    assert.notEqual(parsed, null);
    assert.equal(parsed?.sourceVolume, "redis_data");
    assert.equal(parsed?.timestamp, 1710000000000);
    assert.equal(typeof parsed?.formattedDate, "string");
  });

  it("returns null for non-snapshot names", () => {
    assert.equal(parseSnapshotVolumeName("regular_volume"), null);
    assert.equal(parseSnapshotVolumeName("snap_incomplete"), null);
  });
});
