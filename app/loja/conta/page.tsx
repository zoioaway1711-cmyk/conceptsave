import type { Metadata } from "next";
import { AccountView } from "../_components/account-view";
import { Breadcrumbs } from "../_components/ui";

export const metadata: Metadata = {
  title: "Minha conta",
  robots: { index: false, follow: false },
};

export default function ContaPage() {
  return (
    <div className="lj-container py-6 sm:py-8">
      <Breadcrumbs items={[{ label: "Loja", href: "/loja" }, { label: "Minha conta" }]} />
      <h1 className="lj-h2 mb-2 mt-4 sm:text-[32px]">Minha conta</h1>
      <p className="lj-small lj-muted mb-6 max-w-2xl">
        A loja ainda não tem login próprio. Tudo o que aparece aqui fica guardado só neste navegador — você pode apagar a qualquer
        momento.
      </p>
      <div className="min-h-[80vh]">
        <AccountView />
      </div>
    </div>
  );
}
