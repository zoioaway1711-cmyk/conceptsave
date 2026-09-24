/*
 * Order status vocabulary shared by the storefront and the admin. Only
 * statuses the backend can actually be in are listed; the admin moves an
 * order along ALLOWED_TRANSITIONS, and the customer sees exactly that
 * recorded history — never an inferred step.
 */

export const ORDER_STATUSES = ["received", "payment_approved", "preparing", "shipped", "delivered", "cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  received: "Pedido recebido",
  payment_approved: "Pagamento confirmado",
  preparing: "Em preparação",
  shipped: "Enviado",
  delivered: "Entregue",
  cancelled: "Cancelado",
};

export const ORDER_STATUS_HINT: Record<OrderStatus, string> = {
  received: "Nossa equipe vai entrar em contato pelo e-mail ou celular informados para combinar o pagamento.",
  payment_approved: "Pagamento confirmado pela nossa equipe. O pedido segue para separação.",
  preparing: "Separando e embalando os itens.",
  shipped: "O pedido saiu do estoque. Use o código de rastreio para acompanhar a entrega.",
  delivered: "Pedido entregue.",
  cancelled: "Este pedido foi cancelado.",
};

export const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  received: ["payment_approved", "cancelled"],
  payment_approved: ["preparing", "cancelled"],
  preparing: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: [],
};

/** The happy path, for the progress timeline. */
export const ORDER_FLOW: OrderStatus[] = ["received", "payment_approved", "preparing", "shipped", "delivered"];

export function isOrderStatus(v: unknown): v is OrderStatus {
  return typeof v === "string" && (ORDER_STATUSES as readonly string[]).includes(v);
}
