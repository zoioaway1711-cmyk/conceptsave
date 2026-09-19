import { hasPermission, requireViewer } from "../../_lib/session";
import { NoAccess } from "../../_components/no-access";
import { ImportClient } from "./import-client";

export default async function LicensesImportPage() {
  const admin = await requireViewer();
  if (!hasPermission(admin, "admin.materials.manage") || !hasPermission(admin, "admin.licenses.manage")) {
    return <NoAccess permission="admin.licenses.manage" />;
  }
  return <ImportClient />;
}
