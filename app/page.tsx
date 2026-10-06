import { redirect } from "next/navigation";

// The real product is the verification/login portal at public/index.html
// (a static page, outside this Next.js runtime) — this route used to show
// a separate marketing hero first (components/demo.tsx), forcing an extra
// click through a blank-looking splash screen before reaching it. Land
// straight on the real thing instead.
//
// The query string goes along: the QR Codes printed for each license point
// at `/?serial=...` (admin → Importar), and public/app.js reads that serial
// to log the customer in. Dropping it left them on an empty login form.
export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(await searchParams)) {
    for (const item of [value].flat()) if (item !== undefined) query.append(name, item);
  }
  const search = query.toString();
  redirect(search ? `/index.html?${search}` : "/index.html");
}
