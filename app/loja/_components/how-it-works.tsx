import { CreditCard, PackageCheck, ShoppingBag, Truck } from "lucide-react";
import { STORE } from "../_lib/catalog";

/*
 * The real purchase flow, spelled out (premium DTC health brands do this
 * up front). Matters here because payment is arranged with the team after
 * the order — shoppers should know that before checkout, not after.
 */
// Built per render: the delivery window comes from the live settings.
const steps = () => [
  { icon: ShoppingBag, title: "Faça o pedido", text: "Escolha os itens e informe seus dados e o endereço. Nada é cobrado no site." },
  { icon: CreditCard, title: "Combine o pagamento", text: "Nossa equipe entra em contato pelo e-mail ou celular para o Pix, cartão ou boleto." },
  { icon: Truck, title: "Envio com rastreio", text: `Após a confirmação, enviamos de ${STORE.city} com nota fiscal. Prazo médio de ${STORE.delivery.window}.` },
  { icon: PackageCheck, title: "Acompanhe tudo", text: "Cada etapa aparece no link do seu pedido, salvo em “Minha conta”." },
];

export function HowItWorks({ compact }: { compact?: boolean }) {
  const STEPS = steps();
  return (
    <ol className={`grid gap-4 ${compact ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-4"}`}>
      {STEPS.map((s, i) => (
        <li key={s.title} className={`flex gap-3 ${compact ? "" : "lj-card lj-card--pad flex-col"}`}>
          <span className="flex items-center gap-3">
            <span className="lj-icon-circle">
              <s.icon aria-hidden="true" />
            </span>
            {!compact && <span className="lj-display text-3xl font-extrabold text-[color:var(--lj-line-strong)]">{i + 1}</span>}
          </span>
          <span>
            <strong className="block text-sm text-[color:var(--lj-ink)]">
              {compact && `${i + 1}. `}
              {s.title}
            </strong>
            <span className="lj-small lj-muted">{s.text}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
