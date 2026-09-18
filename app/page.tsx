import { redirect } from "next/navigation";

// The real product is the verification/login portal at public/index.html
// (a static page, outside this Next.js runtime) — this route used to show
// a separate marketing hero first (components/demo.tsx), forcing an extra
// click through a blank-looking splash screen before reaching it. Land
// straight on the real thing instead.
export default function Home() {
  redirect("/index.html");
}
