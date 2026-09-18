import { redirect } from "next/navigation";

// Superseded by /admin/dashboard (part of the unified, RBAC-gated /admin
// app) — kept as a redirect rather than deleted outright so any existing
// bookmarks/links to this path keep working.
export default function UsuariosPage() {
  redirect("/admin/dashboard");
}
