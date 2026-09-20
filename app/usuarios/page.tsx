import { redirect } from "next/navigation";

// Retired: used to redirect straight into the admin panel, which meant
// this public, guessable path publicly disclosed the admin URL to anyone
// who visited it (no login required to see the redirect's Location
// header) — a direct violation of "no public navigation ever points at
// the admin panel" (see SECURITY.md). Sends visitors home instead.
export default function UsuariosPage() {
  redirect("/");
}
