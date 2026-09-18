import { hasPermission, requireViewer } from "../_lib/session";
import { NoAccess } from "../_components/no-access";
import { DashboardClient } from "./dashboard-client";

export default async function DashboardPage() {
  const admin = await requireViewer();
  if (!hasPermission(admin, "admin.dashboard.view")) return <NoAccess permission="admin.dashboard.view" />;
  return <DashboardClient canManageProfiles={hasPermission(admin, "admin.profiles.manage")} />;
}
