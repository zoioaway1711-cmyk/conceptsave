import { redirect } from "next/navigation";
import { getViewer } from "./_lib/session";
import { LoginForm } from "./login-form";

export default async function AdminLoginPage() {
  const admin = await getViewer();
  if (admin) redirect("/sc-629f1dc76b/dashboard");
  return <LoginForm />;
}
