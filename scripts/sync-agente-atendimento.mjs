#!/usr/bin/env node
/*
 * Gera as definições do agente "Save Concept | Atendimento e Catálogo" para
 * Claude Code (.claude/agents) e Codex (.codex/agents) a partir da fonte
 * única em docs/agentes/atendimento-loja/. Edite só os .md de lá e rode:
 *
 *   node scripts/sync-agente-atendimento.mjs          # regrava os dois arquivos
 *   node scripts/sync-agente-atendimento.mjs --check  # falha se estiverem desatualizados
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (name) => readFileSync(join(root, "docs/agentes/atendimento-loja", name), "utf8").trim();

const NAME = "Save Concept | Atendimento e Catálogo";
const DESCRIPTION =
  "Assistente virtual de atendimento ao cliente e navegação da Save Concept Loja Oficial: catálogo, autenticidade, envio, pagamento, pedidos e políticas publicadas, sem orientação de uso ou de saúde.";
const GENERATED = "Arquivo gerado por scripts/sync-agente-atendimento.mjs a partir de docs/agentes/atendimento-loja/. Não edite à mão.";

const instructions = `${src("instrucoes-sistema.md")}

---

BASE DE CONHECIMENTO ANEXADA (use só quando não conseguir abrir a página oficial)

${src("base-conhecimento.md")}`;

// Claude Code: só leitura das páginas públicas da loja. Sem Bash, edição ou escrita.
const claude = `---
name: atendimento-save
description: "${NAME}. ${DESCRIPTION} Use para responder ou rascunhar respostas a clientes da loja e para rodar os testes de qualidade do atendimento."
tools: WebFetch, Read
model: sonnet
---
<!-- ${GENERATED} -->

Use a ferramenta WebFetch somente em URLs que comecem com https://saveconcept.com.br/loja. Não acesse outros sites, o painel administrativo, APIs ou arquivos do repositório além desta instrução.

${instructions}
`;

if (instructions.includes("'''")) throw new Error("As instruções não podem conter ''' (quebraria o TOML).");
const codex = `# ${GENERATED}
name = "atendimento_save"
description = "${NAME}. ${DESCRIPTION}"
sandbox_mode = "read-only"
developer_instructions = '''
Somente leitura: não modifique arquivos, não execute comandos que alterem o sistema e não acesse o painel administrativo, APIs internas ou o banco de dados.
Consulte apenas páginas públicas que comecem com https://saveconcept.com.br/loja.

${instructions}
'''
`;

const targets = [
  [join(root, ".claude/agents/atendimento-save.md"), claude],
  [join(root, ".codex/agents/atendimento-save.toml"), codex],
];

const check = process.argv.includes("--check");
let stale = false;
for (const [file, content] of targets) {
  let current = "";
  try {
    current = readFileSync(file, "utf8");
  } catch {
    // arquivo ainda não existe
  }
  if (current === content) continue;
  if (check) {
    console.error(`Desatualizado: ${file}`);
    stale = true;
  } else {
    writeFileSync(file, content);
    console.log(`Gerado: ${file}`);
  }
}
if (stale) {
  console.error("Rode: node scripts/sync-agente-atendimento.mjs");
  process.exit(1);
}
if (check) console.log("Agente de atendimento sincronizado.");
