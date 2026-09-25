import { applyCatalog } from "../../app/loja/_lib/catalog";
import { SEED_PRODUCTS, SEED_SETTINGS } from "../../lib/loja-catalog-seed";

let n = 0;
/** Loads the migration-0015 seed into the catalog registry (for tests without a DB). */
export function applySeedCatalog() {
  applyCatalog({ version: `seed-${++n}`, products: structuredClone(SEED_PRODUCTS), settings: { ...SEED_SETTINGS } });
}
