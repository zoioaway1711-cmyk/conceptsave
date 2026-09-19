import { hasPermission, requireViewer } from "../_lib/session";
import { NoAccess } from "../_components/no-access";
import { LicensesClient } from "./licenses-client";

export default async function LicensesPage({ searchParams }: { searchParams: Promise<{ materialId?: string }> }) {
  const admin = await requireViewer();
  if (!hasPermission(admin, "admin.licenses.manage")) return <NoAccess permission="admin.licenses.manage" />;
  const params = await searchParams;
  return (
    <LicensesClient
      initialMaterialId={params.materialId ?? null}
      canInspectUsers={hasPermission(admin, "admin.users.inspect")}
      canManageProfiles={hasPermission(admin, "admin.profiles.manage")}
    />
  );
}
