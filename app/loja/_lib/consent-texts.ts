/**
 * Exact wording shown next to each e-mail opt-in. The server stores the
 * text the visitor actually agreed to (by key), so the record proves what
 * consent was given even if the wording changes later.
 */
export const OPT_IN_TEXT = {
  news: "Quero receber por e-mail avisos de lançamentos e de reposição de estoque da loja Save Concept. Posso cancelar quando quiser.",
  restock: "Quero receber um único e-mail quando este produto voltar ao estoque. Meu e-mail não será usado para outra finalidade.",
} as const;
export type OptInKind = keyof typeof OPT_IN_TEXT;
