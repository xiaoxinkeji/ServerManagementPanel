import { serverT } from "@/lib/i18n/runtime";
import { guardApi } from "@/lib/auth/api";
import { diagnoseContainerById } from "@/lib/ai/jev-server";

export const dynamic = "force-dynamic";

/**
 * 使用本地日志规则引擎诊断容器状态与近期日志异常
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await guardApi(request, "docker.view");
  if (!guard.ok) return guard.response;

  const { id } = await params;

  try {
    const result = await diagnoseContainerById(id, "manual");
    if (!result) {
      return Response.json({ error: serverT("api.notFound.container") }, { status: 404 });
    }

    return Response.json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return Response.json({ error: msg }, { status: 400 });
  }
}
