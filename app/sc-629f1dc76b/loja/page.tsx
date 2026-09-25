import { hasPermission, requireViewer } from "../_lib/session";
import { NoAccess } from "../_components/no-access";
import { LojaAdminClient } from "./loja-client";

export default async function LojaAdminPage() {
  const admin = await requireViewer();
  const canOrders = hasPermission(admin, "admin.store.orders");
  const canAnalytics = hasPermission(admin, "admin.store.analytics");
  const canCatalog = hasPermission(admin, "admin.store.catalog");
  if (!canOrders && !canAnalytics && !canCatalog) return <NoAccess permission="admin.store.orders" />;
  return <LojaAdminClient canOrders={canOrders} canAnalytics={canAnalytics} canCatalog={canCatalog} />;
}
