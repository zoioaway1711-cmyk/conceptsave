import { hasPermission, requireViewer } from "../_lib/session";
import { NoAccess } from "../_components/no-access";
import { AdminsClient } from "./admins-client";

export default async function AdminsPage() {
  const admin = await requireViewer();
  if (!hasPermission(admin, "admin.admins.manage")) return <NoAccess permission="admin.admins.manage" />;
  return <AdminsClient currentAdminId={admin.id} />;
}
