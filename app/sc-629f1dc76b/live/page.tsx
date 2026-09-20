import { hasPermission, requireViewer } from "../_lib/session";
import { NoAccess } from "../_components/no-access";
import { LiveClient } from "./live-client";

export default async function LivePage() {
  const admin = await requireViewer();
  if (!hasPermission(admin, "admin.live.view")) return <NoAccess permission="admin.live.view" />;
  return (
    <LiveClient
      canInspectUsers={hasPermission(admin, "admin.users.inspect")}
      canManageProfiles={hasPermission(admin, "admin.profiles.manage")}
    />
  );
}
