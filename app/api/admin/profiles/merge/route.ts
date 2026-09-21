import { env } from "cloudflare:workers";
import { requirePermission } from "@/lib/admin-auth";
import { isSameOrigin, readBody } from "@/lib/api-validation";
import { mergeProfiles } from "@/lib/profile-merge";
import { recordLiveEvent } from "@/lib/live-events";
import { clientIp } from "@/lib/rate-limit";
import { z } from "zod";

function db() {
  return (env as unknown as { DB: D1Database }).DB;
}

const mergeSchema = z.object({
  survivorId: z.string().trim().min(1).max(80),
  loserId: z.string().trim().min(1).max(80),
});

export async function POST(request: Request) {
  const admin = await requirePermission(request, "admin.profiles.manage");
  if (admin instanceof Response) return admin;
  if (!isSameOrigin(request)) return Response.json({ error: "invalid_origin" }, { status: 403 });
  const body = await readBody(request, mergeSchema);
  if (!body) return Response.json({ error: "invalid_body" }, { status: 400 });

  const result = await mergeProfiles(db(), {
    survivorId: body.survivorId,
    loserId: body.loserId,
    adminId: admin.id,
    adminUsername: admin.username,
    ip: clientIp(request),
  });
  if ("error" in result) {
    const status = result.error === "survivor_not_found" || result.error === "loser_not_found" ? 404 : 409;
    return Response.json({ error: result.error }, { status });
  }
  await recordLiveEvent(db(), { type: "ADMIN_ACTION", severity: "warning", actorAdminId: admin.id, actorProfileId: result.survivorId, ip: clientIp(request), reason: "profiles_merged" });
  return Response.json({ merged: true, profile: result });
}
