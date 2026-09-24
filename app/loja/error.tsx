"use client";

import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";

/** Route-level failure inside /loja: explain, offer a retry, keep the header/footer. */
export default function LojaError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="lj-container flex min-h-[60vh] flex-col items-center justify-center gap-4 py-12 text-center" role="alert">
      <span className="lj-icon-circle size-14">
        <AlertTriangle aria-hidden="true" />
      </span>
      <h1 className="lj-h2">Algo não carregou como deveria</h1>
      <p className="lj-small lj-muted max-w-md">
        Pode ter sido uma falha de conexão. Seu carrinho e seus dados continuam salvos neste navegador.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <button type="button" className="lj-btn lj-btn--primary" onClick={() => reset()}>
          <RotateCcw aria-hidden="true" /> Tentar de novo
        </button>
        <Link href="/loja" className="lj-btn lj-btn--secondary">
          Ir para a loja
        </Link>
      </div>
    </div>
  );
}
