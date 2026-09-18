import { hasPermission, requireViewer } from "../_lib/session";
import { NoAccess } from "../_components/no-access";
import { AuditClient } from "./audit-client";

export default async function AuditPage() {
  const admin = await requireViewer();
  if (!hasPermission(admin, "admin.audit.view")) return <NoAccess permission="admin.audit.view" />;
  return <AuditClient />;
}
