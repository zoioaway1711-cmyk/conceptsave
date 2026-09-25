import Link from "next/link";
import { loadCatalog } from "@/lib/loja-catalog";
import { SearchX } from "lucide-react";
import { CategoryCards } from "./_components/sections";
import { EmptyArt } from "./_components/empty-art";
import { SearchBox } from "./_components/search-box";

export default async function LojaNotFound() {
  await loadCatalog();
  return (
    <div className="lj-container flex flex-col gap-8 py-10 sm:py-14">
      <div className="mx-auto flex max-w-xl flex-col items-center gap-4 text-center">
        <EmptyArt icon={SearchX} />
        <h1 className="lj-h2">Não encontramos esta página</h1>
        <p className="lj-small lj-muted">O endereço pode ter mudado ou o produto saiu do catálogo. Tente buscar ou escolha uma categoria.</p>
        <div className="w-full max-w-md text-left">
          <SearchBox />
        </div>
        <Link href="/loja" className="lj-link text-sm">
          Voltar para a página inicial da loja
        </Link>
      </div>
      <CategoryCards />
    </div>
  );
}
