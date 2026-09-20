import { serverT } from "@/lib/i18n/runtime";
import { guardApi } from "@/lib/auth/api";
import { audit } from "@/lib/auth/audit";
import { getDockerProvider } from "@/lib/providers";
import { cloneVolume } from "@/lib/docker/volumes";
import {
  generateSnapshotVolumeName,
  parseSnapshotVolumeName,
  isSnapshotVolume,
} from "@/lib/docker/snapshots";

export const dynamic = "force-dynamic";

/**
 * 卷快照管理接口：
 * GET: 获取快照列表或指定卷的历史快照
 * POST: 一键创建快照 (action: "create") 或从快照极速回滚 (action: "restore")
 * DELETE: 删除指定快照
 */
export async function GET(request: Request) {
  const guard = await guardApi(request, "docker.view");
  if (!guard.ok) return guard.response;

  try {
    const { searchParams } = new URL(request.url);
    const filterVolume = searchParams.get("volume");

    const provider = getDockerProvider();
    const allVolumes = await provider.volumes();

    const snapshots = allVolumes
      .filter((v) => isSnapshotVolume(v.name))
      .map((v) => {
        const meta = parseSnapshotVolumeName(v.name);
        return {
          name: v.name,
          driver: v.driver,
          sourceVolume: meta?.sourceVolume || "unknown",
          createdAt: meta?.timestamp || 0,
          formattedDate: meta?.formattedDate || "",
        };
      })
      .filter((s) => !filterVolume || s.sourceVolume === filterVolume)
      .sort((a, b) => b.createdAt - a.createdAt);

    return Response.json({ snapshots });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const guard = await guardApi(request, "docker.action");
  if (!guard.ok) return guard.response;

  try {
    const body = (await request.json()) as {
      action?: "create" | "restore";
      volume?: string;
      snapshot?: string;
    };

    const action = body.action || "create";
    const actor = {
      username: guard.session.user.username,
      userId: guard.session.user.id,
    };

    if (action === "create") {
      const volume = body.volume?.trim();
      if (!volume) {
        return Response.json({ error: serverT("api.invalidRequest") }, { status: 400 });
      }

      const snapshotName = generateSnapshotVolumeName(volume);
      const result = await cloneVolume(volume, snapshotName, actor);

      if (!result.ok) {
        return Response.json({ error: result.message }, { status: 400 });
      }

      audit({
        userId: actor.userId,
        username: actor.username,
        action: "docker.volume.snapshot_create",
        targetType: "volume",
        targetId: volume,
        detail: `成功为卷 ${volume} 创建安全快照: ${snapshotName}`,
        result: "ok",
      });

      return Response.json({
        ok: true,
        sourceVolume: volume,
        snapshotName,
        message: `Snapshot ${snapshotName} created successfully`,
      });
    }

    if (action === "restore") {
      const snapshot = body.snapshot?.trim();
      const targetVolume = body.volume?.trim();

      if (!snapshot || !targetVolume) {
        return Response.json({ error: serverT("api.invalidRequest") }, { status: 400 });
      }

      const provider = getDockerProvider();
      // 检查源快照是否存在
      const allVolumes = await provider.volumes();
      if (!allVolumes.some((v) => v.name === snapshot)) {
        return Response.json({ error: `Snapshot ${snapshot} not found` }, { status: 404 });
      }

      // 为安全起见，回滚之前自动为当前目标卷打底一份恢复前快照 pre_restore
      const preRestoreSnap = generateSnapshotVolumeName(`pre_${targetVolume}`);
      await cloneVolume(targetVolume, preRestoreSnap, actor).catch(() => {});

      // 清空并用快照覆写目标卷
      // 使用辅助容器将快照数据同步回目标卷
      const restoreRun = await provider.runThrowaway({
        image: "alpine:latest",
        cmd: ["sh", "-c", "rm -rf /target/* /target/..?* /target/.[!.]* && cp -a /source/. /target/"],
        binds: [`${snapshot}:/source:ro`, `${targetVolume}:/target`],
        env: {},
        user: "0:0",
        namePrefix: "panel-volume-restore",
        timeoutMs: 120_000,
      });

      if (restoreRun.exitCode !== 0) {
        return Response.json(
          { error: `Restore failed: ${restoreRun.output.slice(0, 200)}` },
          { status: 500 },
        );
      }

      audit({
        userId: actor.userId,
        username: actor.username,
        action: "docker.volume.snapshot_restore",
        targetType: "volume",
        targetId: targetVolume,
        detail: `成功从快照 ${snapshot} 回滚恢复卷 ${targetVolume}（已自动创建防灾备份 ${preRestoreSnap}）`,
        result: "ok",
      });

      return Response.json({
        ok: true,
        sourceSnapshot: snapshot,
        targetVolume,
        preRestoreBackup: preRestoreSnap,
        message: `Volume ${targetVolume} restored from ${snapshot}`,
      });
    }

    return Response.json({ error: "Unsupported action" }, { status: 400 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const guard = await guardApi(request, "docker.action");
  if (!guard.ok) return guard.response;

  try {
    const { searchParams } = new URL(request.url);
    const snapshot = searchParams.get("snapshot")?.trim();

    if (!snapshot || !isSnapshotVolume(snapshot)) {
      return Response.json({ error: "Invalid snapshot name" }, { status: 400 });
    }

    const provider = getDockerProvider();
    await provider.removeResource("volume", snapshot, false);

    audit({
      userId: guard.session.user.id,
      username: guard.session.user.username,
      action: "docker.volume.snapshot_delete",
      targetType: "volume",
      targetId: snapshot,
      detail: `删除持久化卷快照: ${snapshot}`,
      result: "ok",
    });

    return Response.json({ ok: true, deleted: snapshot });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return Response.json({ error: msg }, { status: 500 });
  }
}
