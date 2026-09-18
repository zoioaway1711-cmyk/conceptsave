import { redirect } from "next/navigation";
import { getViewer } from "./_lib/session";
import { LoginForm } from "./login-form";

export default async function AdminLoginPage() {
  const admin = await getViewer();
  if (admin) redirect("/admin/dashboard");
  return <LoginForm />;
}
