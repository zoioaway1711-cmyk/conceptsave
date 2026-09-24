import type { Metadata } from "next";
import Link from "next/link";
import { STORE } from "../_lib/catalog";
import { PrivacyPreferencesButton } from "../_components/consent-banner";
import { Breadcrumbs } from "../_components/ui";

export const metadata: Metadata = {
  title: "Privacidade",
  description: "Quais dados a loja Save Concept coleta, para quê, por quanto tempo e como exercer seus direitos (LGPD).",
};

/*
 * Describes exactly what the code does (lib/loja-orders.ts, lib/loja-events.ts,
 * app/loja/_lib/store.ts, /api/loja/cep). If a data flow changes, this page
 * must change with it. Text should still be reviewed by legal counsel.
 */
function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="lj-h3">{title}</h2>
      <div className="lj-small flex flex-col gap-2 text-[color:var(--lj-text)]">{children}</div>
    </section>
  );
}

export default function PrivacidadePage() {
  return (
    <div className="lj-container max-w-3xl py-6 sm:py-8">
      <Breadcrumbs items={[{ label: "Loja", href: "/loja" }, { label: "Privacidade" }]} />
      <h1 className="lj-h2 mb-2 mt-4 sm:text-[32px]">Privacidade na loja</h1>
      <p className="lj-small lj-muted mb-6">
        Controlador: {STORE.legalName}, CNPJ {STORE.cnpj}, {STORE.city}.
      </p>

      <div className="lj-card lj-card--pad flex flex-col gap-6">
        <Block title="Dados do pedido">
          <p>
            Quando você finaliza um pedido guardamos nome, e-mail, celular, CPF e endereço de entrega, para processar o pedido, emitir a
            nota fiscal, combinar o pagamento e entregar. O CPF fica armazenado de forma criptografada e só é consultado pela equipe
            autorizada para a nota fiscal (cada consulta fica registrada).
          </p>
          <p>Os dados de cartão nunca são coletados por este site.</p>
        </Block>
        <Block title="Consulta de CEP">
          <p>
            O CEP digitado é enviado ao serviço público ViaCEP, a partir dos nossos servidores, só para encontrar o endereço. Nenhum outro
            dado vai junto.
          </p>
        </Block>
        <Block title="Medição de uso (opcional)">
          <p>
            Só com a sua autorização no aviso de privacidade, registramos de forma anônima como a loja é usada: produtos vistos, buscas
            (sem e-mails ou números digitados), etapas da compra. Fica nos nossos servidores, sem terceiros, com um identificador aleatório
            por aba do navegador, e é apagado após 90 dias.
          </p>
          <p>
            <PrivacyPreferencesButton />
          </p>
        </Block>
        <Block title="Avisos por e-mail (opcional)">
          <p>
            Se você pedir para ser avisado de lançamentos ou da volta de um produto ao estoque, guardamos o e-mail e a data do seu
            consentimento só para essa finalidade. Você pode pedir a exclusão a qualquer momento pelo atendimento.
          </p>
        </Block>
        <Block title="Dados guardados no seu navegador">
          <p>
            Carrinho, favoritos, produtos vistos, buscas recentes, CEP e os links dos seus pedidos ficam apenas no seu navegador. Você pode
            apagar tudo em{" "}
            <Link href="/loja/conta#privacidade" className="lj-link">
              Minha conta → Privacidade
            </Link>
            .
          </p>
        </Block>
        <Block title="Seus direitos">
          <p>
            Pela LGPD (art. 18) você pode pedir confirmação, acesso, correção, anonimização ou exclusão dos seus dados, e revogar
            consentimentos.{" "}
            {STORE.privacyEmail ? (
              <>
                Escreva para{" "}
                <a className="lj-link" href={`mailto:${STORE.privacyEmail}`}>
                  {STORE.privacyEmail}
                </a>
                .
              </>
            ) : (
              <>Fale com o nosso atendimento ({STORE.supportHours.toLowerCase()}).</>
            )}
          </p>
        </Block>
      </div>
    </div>
  );
}
