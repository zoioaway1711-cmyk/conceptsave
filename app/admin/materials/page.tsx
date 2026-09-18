import { hasPermission, requireViewer } from "../_lib/session";
import { NoAccess } from "../_components/no-access";
import { MaterialsClient } from "./materials-client";

export default async function MaterialsPage() {
  const admin = await requireViewer();
  if (!hasPermission(admin, "admin.materials.manage")) return <NoAccess permission="admin.materials.manage" />;
  return <MaterialsClient />;
}
