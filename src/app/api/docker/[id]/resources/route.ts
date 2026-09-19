import { serverT } from "@/lib/i18n/runtime";
import { guardApi } from "@/lib/auth/api";
import { audit } from "@/lib/auth/audit";
import { getDockerProvider } from "@/lib/providers";

export const dynamic = "force-dynamic";

/**
 * 动态调整运行中容器的 CPU 与内存资源配额 (无需停机重启)
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await guardApi(request, "docker.action");
  if (!guard.ok) return guard.response;

  const { id } = await params;
  let body: { cpu?: unknown; memoryMb?: unknown; memoryReservationMb?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: serverT("api.invalidRequest") }, { status: 400 });
  }

  const cpu =
    typeof body.cpu === "number" && Number.isFinite(body.cpu) && body.cpu >= 0 && body.cpu <= 1024
      ? body.cpu
      : undefined;
  const memoryMb =
    typeof body.memoryMb === "number" &&
    Number.isFinite(body.memoryMb) &&
    body.memoryMb >= 0 &&
    body.memoryMb <= 1048576
      ? body.memoryMb
      : undefined;
  const reservationMb =
    typeof body.memoryReservationMb === "number" &&
    Number.isFinite(body.memoryReservationMb) &&
    body.memoryReservationMb >= 0 &&
    body.memoryReservationMb <= 1048576
      ? body.memoryReservationMb
      : undefined;

  const nanoCpus = cpu !== undefined ? Math.round(cpu * 1e9) : undefined;
  const memoryBytes = memoryMb !== undefined ? Math.round(memoryMb * 1024 * 1024) : undefined;
  const reservationBytes = reservationMb !== undefined ? Math.round(reservationMb * 1024 * 1024) : undefined;

  try {
    await getDockerProvider().updateResources(id, {
      nanoCpus,
      memoryBytes,
      memoryReservationBytes: reservationBytes,
    });

    audit({
      userId: guard.session.user.id,
      username: guard.session.user.username,
      action: "docker.resources.update",
      targetType: "container",
      targetId: id,
      detail: `CPU: ${cpu ?? "unlimited"}核, 内存: ${memoryMb ?? "unlimited"}MB`,
      result: "ok",
    });

    return Response.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return Response.json({ error: msg }, { status: 400 });
  }
}
