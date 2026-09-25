CREATE TABLE `loja_products` (
	`slug` text PRIMARY KEY NOT NULL,
	`sku` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`brand` text NOT NULL,
	`name` text NOT NULL,
	`presentation` text NOT NULL,
	`category` text NOT NULL,
	`summary` text NOT NULL,
	`description` text NOT NULL,
	`price` real NOT NULL,
	`old_price` real,
	`units_json` text,
	`badge` text,
	`rating` real DEFAULT 0 NOT NULL,
	`review_count` integer DEFAULT 0 NOT NULL,
	`specs_json` text NOT NULL,
	`free_shipping` integer NOT NULL,
	`available` integer NOT NULL,
	`purchasable` integer NOT NULL,
	`cold_chain` integer NOT NULL,
	`health_notice` integer NOT NULL,
	`image_json` text NOT NULL,
	`keywords_json` text NOT NULL,
	`related_json` text NOT NULL,
	`bought_together_json` text NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text NOT NULL,
	CONSTRAINT "loja_products_category_check" CHECK("loja_products"."category" IN ('frascos','kits','acessorios')),
	CONSTRAINT "loja_products_price_check" CHECK("loja_products"."price" > 0 AND ("loja_products"."old_price" IS NULL OR "loja_products"."old_price" > "loja_products"."price"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_loja_products_sku` ON `loja_products` (`sku`);--> statement-breakpoint
CREATE TABLE `loja_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value_json` text NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text NOT NULL
);
--> statement-breakpoint
-- Seed: the catalog/settings exactly as they were hardcoded before this migration.
--> statement-breakpoint
INSERT INTO `loja_products` (slug, sku, sort_order, brand, name, presentation, category, summary, description, price, old_price, units_json, badge, rating, review_count, specs_json, free_shipping, available, purchasable, cold_chain, health_notice, image_json, keywords_json, related_json, bought_together_json, updated_at, updated_by) VALUES ('tirzepatida-60mg', 'tirzepatida-60-individual', 0, 'Save Concept', 'Tirzepatida 60mg', 'Frasco individual · 60mg / 4ml', 'frascos', 'Frasco multidose de 60mg, vidro borossilicato tipo I com selo de inviolabilidade.', 'Mesma base que envasamos desde 2019, agora concentrada em 60mg por frasco. Vidro borossilicato tipo I, lacre com selo de inviolabilidade.', 1290, 1450, NULL, 'Mais vendido', 4.9, 312, '["Concentração: 60mg / 4ml","Lote atual: SC-0924B · val. 08/2027","Conservação: 2-8°C, ao abrigo de luz","Uso: multidose, via subcutânea"]', 1, 1, 0, 1, 1, '{"base":"/loja/tirzepatida-60mg","alt":"Frasco Save Concept Tirzepatida 60mg","width":960,"height":1280}', '["tirzepatida","tirzepatide","frasco","60mg","injetavel"]', '["tirzepatida-60mg-kit-duo","kit-aplicacao-premium","diluente-bacteriostatico"]', '["kit-aplicacao-premium","diluente-bacteriostatico"]', '2026-09-25T00:00:00.000Z', 'migration');
--> statement-breakpoint
INSERT INTO `loja_products` (slug, sku, sort_order, brand, name, presentation, category, summary, description, price, old_price, units_json, badge, rating, review_count, specs_json, free_shipping, available, purchasable, cold_chain, health_notice, image_json, keywords_json, related_json, bought_together_json, updated_at, updated_by) VALUES ('retatrutida-60mg', 'retatrutida-60-individual', 1, 'Save Concept', 'Retatrutida 60mg', 'Frasco individual · 60mg / 4ml', 'frascos', 'Envasada na mesma planta e sob o mesmo controle de lote da linha Tirzepatida.', 'Linha que entrou no catálogo em 2025, envasada na mesma planta e sob o mesmo controle de lote da Tirzepatida — muda o princípio ativo, não o processo.', 1390, NULL, NULL, 'Novidade', 4.9, 41, '["Concentração: 60mg / 4ml","Lote atual: SC-1024R · val. 10/2027","Conservação: 2-8°C, ao abrigo de luz","Uso: multidose, via subcutânea"]', 1, 1, 0, 1, 1, '{"base":"/loja/retatrutida-60mg","alt":"Frasco Save Concept Retatrutida 60mg","width":960,"height":1283}', '["retatrutida","retatrutide","frasco","60mg","injetavel"]', '["kit-aplicacao-premium","diluente-bacteriostatico"]', '["kit-aplicacao-premium","diluente-bacteriostatico"]', '2026-09-25T00:00:00.000Z', 'migration');
--> statement-breakpoint
INSERT INTO `loja_products` (slug, sku, sort_order, brand, name, presentation, category, summary, description, price, old_price, units_json, badge, rating, review_count, specs_json, free_shipping, available, purchasable, cold_chain, health_notice, image_json, keywords_json, related_json, bought_together_json, updated_at, updated_by) VALUES ('tirzepatida-60mg-kit-duo', 'tirzepatida-60-kit-duo', 2, 'Save Concept', 'Tirzepatida 60mg — Kit Duo', 'Kit com 2 frascos · 60mg / 4ml cada', 'kits', 'Dois frascos do mesmo lote, com bolsa térmica reutilizável inclusa.', 'Os mesmos dois frascos vendidos separado, saindo do mesmo lote e com desconto pra quem já fechou a rotina de 2 meses.', 2450, 2680, '{"count":2,"label":"frasco"}', 'Kit com 2 unidades', 4.8, 187, '["Conteúdo: 2x frascos de 60mg / 4ml","Lotes parelhos (mesma leva de produção)","Conservação: 2-8°C, ao abrigo de luz","Inclui: bolsa térmica reutilizável"]', 1, 1, 0, 1, 1, '{"base":"/loja/tirzepatida-60mg","alt":"Frasco Save Concept Tirzepatida 60mg (kit com 2 unidades)","width":960,"height":1280}', '["tirzepatida","tirzepatide","kit","duo","2 frascos","combo"]', '["tirzepatida-60mg","kit-aplicacao-premium","diluente-bacteriostatico"]', '["kit-aplicacao-premium","diluente-bacteriostatico"]', '2026-09-25T00:00:00.000Z', 'migration');
--> statement-breakpoint
INSERT INTO `loja_products` (slug, sku, sort_order, brand, name, presentation, category, summary, description, price, old_price, units_json, badge, rating, review_count, specs_json, free_shipping, available, purchasable, cold_chain, health_notice, image_json, keywords_json, related_json, bought_together_json, updated_at, updated_by) VALUES ('kit-aplicacao-premium', 'kit-aplicacao-premium', 3, 'Save Concept', 'Kit de Aplicação Premium', '10 seringas + bolsa térmica + lenços', 'acessorios', 'Seringas 31G, bolsa térmica compacta, lenços com álcool 70% e cartela de controle.', 'Era o brinde que mandávamos nos primeiros pedidos — virou produto porque quase todo mundo pedia pra comprar avulso.', 219, NULL, NULL, 'Acessório', 4.7, 98, '["10 seringas 1ml com agulha 31G","Bolsa térmica compacta","6 lenços com álcool 70%","Cartela de controle de aplicação"]', 1, 1, 1, 0, 0, '{"base":"/loja/kit-aplicacao","alt":"Kit de Aplicação Save Concept aberto, com seringas, bolsa térmica e lenços com álcool","width":960,"height":877}', '["kit","aplicacao","seringa","seringas","agulha","31g","bolsa termica","alcool","acessorio"]', '["diluente-bacteriostatico"]', '["diluente-bacteriostatico"]', '2026-09-25T00:00:00.000Z', 'migration');
--> statement-breakpoint
INSERT INTO `loja_products` (slug, sku, sort_order, brand, name, presentation, category, summary, description, price, old_price, units_json, badge, rating, review_count, specs_json, free_shipping, available, purchasable, cold_chain, health_notice, image_json, keywords_json, related_json, bought_together_json, updated_at, updated_by) VALUES ('diluente-bacteriostatico', 'diluente-bacteriostatico', 4, 'Save Concept', 'Diluente Bacteriostático', 'NaCl 0,9% · 10ml', 'acessorios', 'Frasco multiperfuração de 10ml, compatível com toda a linha injetável.', 'O mesmo diluente que vai junto quando você fecha um kit completo — vendido separado pra quem só precisa repor.', 89, NULL, NULL, 'Essencial', 4.9, 141, '["Composição: NaCl 0,9% bacteriostático","Volume: 10ml, multiperfuração","Validade após aberto: 28 dias","Compatível com toda a linha injetável"]', 1, 1, 1, 0, 0, '{"base":"/loja/diluente","alt":"Frasco de diluente Save Concept com logo da marca","width":960,"height":1440}', '["diluente","bacteriostatico","agua","nacl","soro","10ml","acessorio"]', '["kit-aplicacao-premium"]', '["kit-aplicacao-premium"]', '2026-09-25T00:00:00.000Z', 'migration');
--> statement-breakpoint
INSERT INTO `loja_settings` (key, value_json, updated_at, updated_by) VALUES ('supportHours', '"Seg. a sex., 9h às 18h"', '2026-09-25T00:00:00.000Z', 'migration');
--> statement-breakpoint
INSERT INTO `loja_settings` (key, value_json, updated_at, updated_by) VALUES ('whatsappUrl', '""', '2026-09-25T00:00:00.000Z', 'migration');
--> statement-breakpoint
INSERT INTO `loja_settings` (key, value_json, updated_at, updated_by) VALUES ('instagramUrl', '""', '2026-09-25T00:00:00.000Z', 'migration');
--> statement-breakpoint
INSERT INTO `loja_settings` (key, value_json, updated_at, updated_by) VALUES ('supportEmail', '""', '2026-09-25T00:00:00.000Z', 'migration');
--> statement-breakpoint
INSERT INTO `loja_settings` (key, value_json, updated_at, updated_by) VALUES ('privacyEmail', '""', '2026-09-25T00:00:00.000Z', 'migration');
--> statement-breakpoint
INSERT INTO `loja_settings` (key, value_json, updated_at, updated_by) VALUES ('maxInstallments', '3', '2026-09-25T00:00:00.000Z', 'migration');
--> statement-breakpoint
INSERT INTO `loja_settings` (key, value_json, updated_at, updated_by) VALUES ('deliveryWindow', '"3 a 7 dias úteis"', '2026-09-25T00:00:00.000Z', 'migration');
--> statement-breakpoint
INSERT INTO `loja_settings` (key, value_json, updated_at, updated_by) VALUES ('deliveryDetail', '"Prazo médio, conforme o CEP. Código de rastreio enviado assim que o pedido sai do estoque."', '2026-09-25T00:00:00.000Z', 'migration');
--> statement-breakpoint
INSERT INTO `loja_settings` (key, value_json, updated_at, updated_by) VALUES ('paymentNote', '"Não há cobrança automática no site: depois do pedido, nossa equipe entra em contato para combinar o pagamento."', '2026-09-25T00:00:00.000Z', 'migration');
--> statement-breakpoint
INSERT INTO `loja_settings` (key, value_json, updated_at, updated_by) VALUES ('returns', '"Até 7 dias corridos após o recebimento, com lacre intacto. Reembolso na mesma forma de pagamento em até 10 dias úteis."', '2026-09-25T00:00:00.000Z', 'migration');
