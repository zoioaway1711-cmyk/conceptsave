import { Coins, PackageCheck, QrCode, ShoppingBag, Truck } from "lucide-react";
import { STORE } from "../_lib/catalog";
import type { PaymentMethod } from "../_lib/checkout";

/*
 * The real purchase flow, spelled out (premium DTC health brands do this
 * up front). Only Pix and crypto are accepted, both paid on the site itself
 * (automatic confirmation) when their gateways are on. If the Pix keys are
 * missing, Pix is arranged with the team, and shoppers should know that
 * before checkout, not after.
 */
// Built per render: the delivery window and gateways come from the live settings.
const steps = (method?: PaymentMethod) => {
  const pixAuto = STORE.gateways.pix;
  const pay =
    pixAuto && method === "pix"
      ? { icon: QrCode, title: "Pague com Pix", text: "Logo após o pedido, pague pelo QR Code ou pelo Pix copia e cola. A confirmação é automática." }
      : method === "crypto"
        ? { icon: Coins, title: "Pague em USDT", text: "Logo após o pedido, envie o valor exato em USDT (rede Tron · TRC20) para o endereço indicado. A confirmação é automática." }
        : pixAuto
          ? {
              icon: QrCode,
              title: "Pague no site",
              text: `Pix na hora, pelo QR Code${STORE.gateways.crypto ? ", ou cripto (USDT na rede Tron)" : ""}, com confirmação automática.`,
            }
          : { icon: QrCode, title: "Combine o pagamento", text: "Nossa equipe entra em contato pelo e-mail ou celular para combinar o Pix." };
  return [
    {
      icon: ShoppingBag,
      title: "Faça o pedido",
      text: pixAuto ? "Escolha os itens e informe seus dados e o endereço." : "Escolha os itens e informe seus dados e o endereço. Nada é cobrado no site.",
    },
    pay,
    { icon: Truck, title: "Envio com rastreio", text: `Após a confirmação, enviamos de ${STORE.city} com nota fiscal. Prazo médio de ${STORE.delivery.window}.` },
    { icon: PackageCheck, title: "Acompanhe tudo", text: "Cada etapa aparece no link do seu pedido, salvo em “Minha conta”." },
  ];
};

export function HowItWorks({ compact, method }: { compact?: boolean; method?: PaymentMethod }) {
  const STEPS = steps(method);
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
