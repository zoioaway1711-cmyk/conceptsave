function unlockAdmin() {
  document.body.classList.remove("admin-locked");
  document.querySelector("#admin-login-gate").hidden = true;
  document.querySelector("#admin-user").value = "";
  document.querySelector("#admin-password").value = "";
  document.body.dataset.adminMode = "central";
}
function lockAdmin(message = "A sessão expirou. Entre novamente para continuar.") {
  document.body.classList.add("admin-locked");
  document.querySelector("#admin-login-gate").hidden = false;
  document.querySelector("#admin-login-error").textContent = message;
  document.querySelector("#admin-user").focus();
}
async function checkAdminSession() {
  try {
    const response = await fetch("/api/admin/session", {
      credentials: "same-origin",
    });
    if (!response.ok) return false;
    if((await response.json()).role==='operator'){location.href='/operator.html';return true;}
    unlockAdmin();
    await loadRemoteProducts();
    await loadRemoteVerifications();
    return true;
  } catch {
    return false;
  }
}
checkAdminSession().catch(() => {});
document
  .querySelector("#admin-login-form")
  .addEventListener("submit", async (e) => {
    e.preventDefault();
    const user = document.querySelector("#admin-user").value.trim(),
      password = document.querySelector("#admin-password").value,
      error = document.querySelector("#admin-login-error");
    error.textContent = "A verificar…";
    try {
      const response = await fetch("/api/admin/session", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ user, password }),
      });
      if (response.status === 429) {
        error.textContent = "Muitas tentativas. Aguarde 15 minutos antes de tentar novamente.";
        return;
      }
      if (response.ok) {
        if((await response.json()).role==='operator'){location.href='/operator.html';return;}
        error.textContent = "";
        unlockAdmin();
        await loadRemoteProducts();
        await loadRemoteVerifications();
        return;
      }
    } catch {}
    error.textContent = "Login ou senha incorretos.";
  });
document.querySelector("#admin-logout").addEventListener("click", async () => {
  await fetch("/api/admin/session", {
    method: "DELETE",
    credentials: "same-origin",
  }).catch(() => {});
  location.reload();
});
const seeds = [];
function loadRecords() { return []; }
let records = loadRecords(),
  lang = localStorage.getItem("vf-admin-language") || "pt",
  filter = "",
  customerFilter = "";
let remoteVerifications = [],
  remoteCustomerProfiles = [],
  customerProfiles = [];
const words = {
  pt: {
    back: "Portal público",
    eyebrow: "GESTÃO DE AUTENTICIDADE",
    title: "Painel administrativo",
    intro: "Catálogo e ativações sincronizados com o banco central.",
    badge: "PostgreSQL central",
    newLabel: "NOVO PRODUTO",
    generateTitle: "Gerar produto e serial",
    product: "Produto",
    dose: "Dosagem",
    maker: "Farmácia / marca",
    lot: "Lote",
    length: "Tamanho do serial",
    generate: "Gerar e validar produto",
    total: "Total",
    valid: "Validados",
    invalid: "Invalidados",
    search: "Pesquisar por serial, produto ou farmácia",
    serialInstruction: "Selecione o ícone ao lado de um serial para visualizar ou descarregar o respetivo selo de autenticação.",
    productTable: "Produto / farmácia",
    actions: "Ações",
    validState: "Validado",
    invalidState: "Invalidado",
    validate: "Validar",
    invalidate: "Invalidar",
    generated: "Produto e serial gerados e validados:",
    security:
      "As alterações são validadas no servidor e ficam disponíveis em todos os dispositivos.",
    customersEyebrow: "CLIENTES E BENEFÍCIOS",
    customersTitle: "Dashboard de clientes",
    customersIntro:
      "Perfis ativos neste portal, respetivos seriais, níveis e benefícios.",
    refreshCustomers: "Atualizar dados",
    customersTotal: "Perfis ativos",
    customersCoupons: "Benefícios ativados",
    customersNear: "Perto do próximo prémio",
    customerSearch: "Pesquisar por ID, serial, nível ou benefício",
    customerId: "ID / última atividade",
    customerSerials: "Seriais ativos",
    customerLevel: "Pontos e nível",
    customerBenefits: "Benefícios ativos",
    customerNext: "Próximo prémio",
    noCustomers: "Nenhum perfil registrado no banco central.",
    noBenefits: "Nenhum benefício ativado",
    rewardsComplete: "Recompensas iniciais completas",
    bottlesFor: (count, reward) =>
      `${count} frasco${count === 1 ? "" : "s"} para ${reward}`,
  },
  en: {
    back: "Public portal",
    eyebrow: "AUTHENTICITY MANAGEMENT",
    title: "Admin panel",
    intro: "200 products with verified dosages are already validated.",
    badge: "Local database",
    newLabel: "NEW PRODUCT",
    generateTitle: "Generate product and serial",
    product: "Product",
    dose: "Dosage",
    maker: "Pharmacy / brand",
    lot: "Batch",
    length: "Serial length",
    generate: "Generate and validate product",
    total: "Total",
    valid: "Validated",
    invalid: "Invalidated",
    search: "Search by serial, product or pharmacy",
    serialInstruction: "Select the icon beside a serial to view or download its authentication seal.",
    productTable: "Product / pharmacy",
    actions: "Actions",
    validState: "Validated",
    invalidState: "Invalidated",
    validate: "Validate",
    invalidate: "Invalidate",
    generated: "Product and serial generated and validated:",
    security:
      "Changes are reflected immediately in checks made in this browser.",
    customersEyebrow: "CUSTOMERS AND BENEFITS",
    customersTitle: "Customer dashboard",
    customersIntro:
      "Active profiles in this portal, with serials, levels and benefits.",
    refreshCustomers: "Refresh data",
    customersTotal: "Active profiles",
    customersCoupons: "Activated benefits",
    customersNear: "Close to next reward",
    customerSearch: "Search by ID, serial, level or benefit",
    customerId: "ID / last activity",
    customerSerials: "Active serials",
    customerLevel: "Points and level",
    customerBenefits: "Active benefits",
    customerNext: "Next reward",
    noCustomers: "No active profile in this browser.",
    noBenefits: "No activated benefits",
    rewardsComplete: "Initial rewards completed",
    bottlesFor: (count, reward) =>
      `${count} bottle${count === 1 ? "" : "s"} to ${reward}`,
  },
};
const ids = {
  back: "back-label",
  eyebrow: "admin-eyebrow",
  title: "admin-title",
  intro: "admin-intro",
  badge: "admin-badge",
  newLabel: "new-label",
  generateTitle: "generate-title",
  product: "product-label",
  dose: "dose-label",
  maker: "maker-label",
  lot: "lot-label",
  length: "length-label",
  generate: "generate-button",
  total: "total-label",
  valid: "valid-label",
  invalid: "invalid-label",
  search: "search-label",
  productTable: "product-table-label",
  serialInstruction: "serial-instruction",
  actions: "actions-label",
  security: "admin-security",
  customersEyebrow: "customers-eyebrow",
  customersTitle: "customers-title",
  customersIntro: "customers-intro",
  refreshCustomers: "refresh-customers",
  customersTotal: "customers-total-label",
  customersCoupons: "customers-coupons-label",
  customersNear: "customers-near-label",
  customerSearch: "customer-search-label",
  customerId: "customer-id-heading",
  customerSerials: "customer-serials-heading",
  customerLevel: "customer-level-heading",
  customerBenefits: "customer-benefits-heading",
  customerNext: "customer-next-heading",
};
async function save(product) {
 try { await persistProducts([product]); await loadRemoteProducts(); await loadRemoteVerifications(); return true; }
 catch { adminNotice('Não foi possível salvar. A alteração não foi confirmada.'); await loadRemoteProducts().catch(() => {}); return false; }
}
async function persistProducts(products) {
  const response = await fetch("/api/admin/products", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ products }),
  });
  if (!response.ok) throw new Error("catalog persistence unavailable");
  return response.json();
}
async function loadRemoteProducts() {
 const response=await fetch('/api/admin/products',{credentials:'same-origin',cache:'no-store'});
 if(!response.ok) throw new Error('Catálogo indisponível');
 const payload=await response.json(); records=payload.products || [];
 document.querySelector('#product-suggestions').innerHTML=[...new Set(records.map(x=>x.name))].map(name=>`<option value="${escapeHtml(name)}"></option>`).join('');
 render();
}
function setLanguage(next) {
  lang = next;
  localStorage.setItem("vf-admin-language", lang);
  document.documentElement.lang = lang === "en" ? "en-GB" : "pt-PT";
  Object.entries(ids).forEach(
    ([key, id]) => (document.getElementById(id).textContent = words[lang][key]),
  );
  document
    .querySelectorAll("[data-admin-lang]")
    .forEach((b) => b.classList.toggle("active", b.dataset.adminLang === lang));
  render();
}
function render() {
  const q = filter.toLowerCase(),
    rows = records.filter(
      (x) =>
        !q ||
        [x.serial, x.name, x.maker, x.lot].some((v) =>
          String(v || "")
            .toLowerCase()
            .includes(q),
        ),
    );
  document.querySelector("#admin-total").textContent = records.length;
  document.querySelector("#admin-active").textContent = records.filter(
    (x) => x.status === "authentic",
  ).length;
  document.querySelector("#admin-blocked").textContent = records.filter(
    (x) => x.status === "invalid",
  ).length;
  document.querySelector("#admin-body").innerHTML = rows
    .map(
      (x) =>
        `<tr><td><strong>${escapeHtml(x.serial)}</strong></td><td>${escapeHtml(x.name)}<small style="display:block;color:#718095">${x.brand ? `${escapeHtml(x.brand)} · ` : ""}${escapeHtml(x.maker)} · ${escapeHtml(x.lot)}</small></td><td><span class="status-pill ${escapeHtml(x.status)}">${x.status === "authentic" ? words[lang].validState : words[lang].invalidState}</span></td><td><div class="admin-actions"><button class="qr-action icon-action" data-qr="${escapeHtml(x.serial)}" type="button" aria-label="${lang === "en" ? "View authentication seal" : "Ver selo de autenticação"}" title="${lang === "en" ? "View authentication seal" : "Ver selo de autenticação"}"><span class="qr-icon" aria-hidden="true"></span></button><button data-serial="${escapeHtml(x.serial)}" data-state="${x.status === "authentic" ? "invalid" : "authentic"}" type="button">${x.status === "authentic" ? words[lang].invalidate : words[lang].validate}</button></div></td></tr>`,
    )
    .join("");
}
function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[char],
  );
}
const CUSTOMER_RANKS = [
  { level: 1, name: "Bronze", points: 0 },
  { level: 2, name: "Prata", points: 1000 },
  { level: 3, name: "Ouro", points: 2000 },
  { level: 4, name: "Platina", points: 3000 },
  { level: 5, name: "Diamante", points: 5000 },
];
async function updateCustomer(profileId, updater) {
 const current=remoteCustomerProfiles.find(p=>p.id===profileId);
 if(!current) return null;
 const updated=updater({...current});
 try {
  const response=await fetch('/api/admin/profiles',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify(updated)});
  const payload=await response.json();
  if(!response.ok) throw new Error(payload.error==='serial_already_claimed'?'Este serial já pertence a outro perfil.':'Não foi possível salvar o perfil.');
  remoteCustomerProfiles=remoteCustomerProfiles.map(p=>p.id===profileId?payload.profile:p);
  return payload.profile;
 } catch(error) {adminNotice(error.message);return null;}
}
function saveCustomerRewardProfile() { /* Profile data is managed centrally. */ }
function nextReward(serialCount) {
  if (serialCount < 3)
    return {
      remaining: 3 - serialCount,
      title: lang === "en" ? "free shipping" : "envio grátis",
    };
  if (serialCount < 5) return { remaining: 5 - serialCount, title: "50% OFF" };
  if (serialCount < 10)
    return {
      remaining: 10 - serialCount,
      title: lang === "en" ? "Buy 1, get 2" : "Pague 1, leve 2",
    };
  return null;
}
function mergeCustomerProfiles() {
 return remoteCustomerProfiles.map(profile=>({...profile,events:profile.events || remoteVerifications.filter(e=>e.profileId===profile.id),benefits:profile.benefits || []}));
}
function productsForProfile(profile) {
  return (profile.serials || []).map((serial) => {
    const event = [...(profile.events || [])]
      .reverse()
      .find((item) => item.serial === serial);
    const catalog = records.find((item) => item.serial === serial);
    return {
      serial,
      name: event?.product || catalog?.name || "Produto não identificado",
      maker: event?.maker || catalog?.maker || "—",
      lot: event?.lot || catalog?.lot || "—",
      status: (profile.revokedSerials || []).includes(serial)
        ? "invalid"
        : event?.status || catalog?.status || "authentic",
      verifiedAt:
        event?.activatedAt ||
        profile.verifiedAt?.[serial] ||
        profile.lastActive ||
        "",
    };
  });
}
function renderCustomers() {
  const profiles = mergeCustomerProfiles().sort(
    (a, b) => new Date(b.lastActive || 0) - new Date(a.lastActive || 0),
  );
  customerProfiles = profiles;
  const q = customerFilter.trim().toLowerCase();
  const rows = profiles.filter(
    (profile) =>
      !q ||
      [
        profile.id,
        profile.levelName,
        ...(profile.serials || []),
        ...(profile.benefits || []).flatMap((benefit) => [
          benefit.title,
          benefit.code,
        ]),
      ].some((value) =>
        String(value || "")
          .toLowerCase()
          .includes(q),
      ),
  );
  document.querySelector("#customers-total").textContent = profiles.length;
  document.querySelector("#customers-coupons").textContent = profiles.reduce(
    (total, profile) => total + (profile.benefits || []).length,
    0,
  );
  document.querySelector("#customers-near").textContent = profiles.filter(
    (profile) => {
      const next = nextReward((profile.serials || []).length);
      return next && next.remaining <= 2;
    },
  ).length;
  document.querySelector("#customers-products").textContent = new Set(
    profiles.flatMap((profile) =>
      productsForProfile(profile).map((product) => product.name),
    ),
  ).size;
  document.querySelector("#customers-activity").textContent =
    remoteVerifications.filter(
      (event) =>
        Date.now() - new Date(event.activatedAt || 0).getTime() <=
      24 * 60 * 60 * 1000,
    ).length;
  document.querySelector("#customers-marketing").textContent = profiles.filter(
    (profile) => profile.consent?.marketing === true,
  ).length;
  document.querySelector("#customer-search").placeholder =
    words[lang].customerSearch;
  document.querySelector("#customer-card-grid").innerHTML = rows.length
    ? rows
        .map((profile) => {
          const products = productsForProfile(profile);
          const names = [...new Set(products.map((item) => item.name))];
          const lastEvent = (profile.events || [])[0];
          return `<article class="customer-profile-card ${profile.blocked ? "customer-blocked" : ""}"><div class="customer-profile-top"><span class="customer-avatar">${escapeHtml(profile.id.slice(-2).toUpperCase())}</span><div><small>ID DO CLIENTE</small><strong>${escapeHtml(profile.id)}</strong><time datetime="${escapeHtml(profile.lastActive || "")}">${new Date(profile.lastActive || Date.now()).toLocaleString(lang === "en" ? "en-GB" : "pt-PT")}</time></div><span class="status-pill ${profile.blocked ? "invalid" : "authentic"}">${profile.blocked ? "Bloqueado" : "Ativo"}</span></div><div class="customer-profile-metrics"><span><small>Seriais</small><strong>${products.filter((item) => item.status === "authentic").length}</strong></span><span><small>Medicamentos</small><strong>${names.length}</strong></span><span><small>Rank</small><strong>${escapeHtml(profile.levelName || "Bronze")}</strong></span></div><div class="customer-medicine-tags">${names.slice(0, 3).map((name) => `<span>${escapeHtml(name)}</span>`).join("")}${names.length > 3 ? `<b>+${names.length - 3}</b>` : ""}</div><div class="customer-card-foot"><small>${escapeHtml(lastEvent?.ip || "Sem IP registado")} · ${escapeHtml(lastEvent?.metadata?.platform || "dispositivo não identificado")}</small><button type="button" data-customer-details="${escapeHtml(profile.id)}">Gerir perfil e permissões</button></div></article>`;
        })
        .join("")
    : `<div class="customer-cards-empty">${words[lang].noCustomers}</div>`;
  document.querySelector("#customers-body").innerHTML = rows.length
    ? rows
        .map((profile) => {
          const serials = Array.isArray(profile.serials) ? profile.serials : [];
          const benefits = Array.isArray(profile.benefits)
            ? profile.benefits
            : [];
          const next = nextReward(serials.length);
          const index = Math.max(0, Number(profile.level || 1) - 1);
          const localizedLevel = (
            lang === "en"
              ? ["Bronze", "Silver", "Gold", "Platinum", "Diamond"]
              : ["Bronze", "Prata", "Ouro", "Platina", "Diamante"]
          )[index];
          return `<tr><td><strong>${escapeHtml(profile.id)}</strong><small class="customer-date">${new Date(profile.lastActive || Date.now()).toLocaleString(lang === "en" ? "en-GB" : "pt-PT")}</small></td><td><div class="serial-tags">${serials
            .slice(0, 4)
            .map((serial) => `<span>${escapeHtml(serial)}</span>`)
            .join(
              "",
            )}${serials.length > 4 ? `<b>+${serials.length - 4}</b>` : ""}</div><small>${serials.length} ${lang === "en" ? "validated" : "validados"}</small></td><td><span class="customer-level-pill">${escapeHtml(localizedLevel || profile.levelName)}</span><strong class="customer-points">${Number(profile.points || 0).toLocaleString(lang === "en" ? "en-GB" : "pt-PT")} pts</strong></td><td><span class="customer-benefits-list">${benefits.length}</span></td><td><span class="status-pill ${profile.blocked ? "invalid" : "authentic"}">${profile.blocked ? "Bloqueado" : "Ativo"}</span><button class="customer-manage" type="button" data-customer-details="${escapeHtml(profile.id)}">Gerenciar</button></td><td><span class="next-reward ${next ? "" : "complete"}">${next ? words[lang].bottlesFor(next.remaining, next.title) : words[lang].rewardsComplete}</span></td></tr>`;
        })
        .join("")
    : `<tr class="empty-row"><td colspan="6">${words[lang].noCustomers}</td></tr>`;
}
async function openCustomerDetail(profileId) {
  try {
    const response=await fetch(`/api/admin/profiles?id=${encodeURIComponent(profileId)}`,{cache:"no-store"});
    if(!response.ok) throw new Error("Não foi possível carregar o histórico do perfil.");
    const payload=await response.json();
    remoteCustomerProfiles=remoteCustomerProfiles.map(p=>p.id===profileId ? {...payload.profile,activityStats:payload.stats} : p);
    customerProfiles=mergeCustomerProfiles();
  } catch(error) {adminNotice(error.message);return;}
  const profile = customerProfiles.find((item) => item.id === profileId);
  if (!profile) return;
  const products = productsForProfile(profile);
  const events = [...(profile.events || [])].sort(
    (a, b) => new Date(b.activatedAt || 0) - new Date(a.activatedAt || 0),
  );
  const ips = [...new Set(events.map((item) => item.ip).filter(Boolean))];
  const platforms = [
    ...new Set(
      events.map((item) => item.metadata?.platform).filter(Boolean),
    ),
  ];
  const timezones = [
    ...new Set(
      events.map((item) => item.metadata?.timezone).filter(Boolean),
    ),
  ];
  const consent = profile.consent || events[0]?.metadata?.consent || {};
  const firstSeen =
    profile.firstSeen ||
    products.map((item) => item.verifiedAt).filter(Boolean).sort()[0] ||
    profile.lastActive;
  const analyticsAllowed = consent.analytics === true;
  const marketingAllowed = consent.marketing === true;
  document.querySelector("#customer-detail-title").textContent =
    `Cliente ${profile.id}`;
  const rankLevel = Number(profile.rankOverride || profile.level || 1);
  const availableProducts = records
    .filter(
      (record) =>
        record.status === "authentic" &&
        !(profile.serials || []).includes(record.serial),
    )
    .slice(0, 200);
  document.querySelector("#customer-detail-content").innerHTML = `
    <details class="customer-detail-section"><summary>Premiações e resgates</summary><p>Confirme somente após o atendimento do vendedor. Cada código pode ser utilizado uma vez.</p>${(profile.benefits || []).map(item=>`<article class="rank-code-card"><strong>${escapeHtml(item.title)} · Nível ${Number(item.rank || 1)}</strong><code>${escapeHtml(item.code)}</code><small>${item.redeemedAt ? (item.title.includes('vitalício') ? 'Vitalício confirmado em ' : 'Utilizado em ')+new Date(item.redeemedAt).toLocaleString('pt-BR') : item.eligible ? 'Disponível' : 'Elegibilidade suspensa'}</small>${item.eligible ? `<button type="button" class="customer-manage" data-confirm-benefit="${escapeHtml(item.code)}" data-profile-id="${escapeHtml(profile.id)}">${item.title.includes('vitalício') ? 'Confirmar ativação do vitalício' : 'Confirmar utilização com vendedor'}</button>` : ''}</article>`).join('') || '<p>Sem códigos emitidos.</p>'}</details>
    <details class="customer-permissions-panel"><summary>Permissões e acesso</summary>
      <div class="permissions-heading"><div><small>CONTROLO ADMINISTRATIVO</small><h3>Rank, cadastro e seriais</h3></div><span class="status-pill ${profile.blocked ? "invalid" : "authentic"}">${profile.blocked ? "Cadastro bloqueado" : "Cadastro ativo"}</span></div>
      <div class="permission-actions">
        <form id="customer-rank-form" data-profile-id="${escapeHtml(profile.id)}">
          <label for="customer-rank-select">Rank do cliente</label>
          <div><select id="customer-rank-select">${CUSTOMER_RANKS.map((rank) => `<option value="${rank.level}" ${rank.level === rankLevel ? "selected" : ""}>${rank.name} · ${rank.points.toLocaleString("pt-PT")} pts</option>`).join("")}</select><button type="submit">Aplicar rank</button></div>
        </form>
        <form id="customer-serial-form" data-profile-id="${escapeHtml(profile.id)}">
          <label for="customer-serial-select">Liberar produto para este cadastro</label>
          <div><select id="customer-serial-select" ${availableProducts.length ? "" : "disabled"}>${availableProducts.length ? availableProducts.map((record) => `<option value="${escapeHtml(record.serial)}">${escapeHtml(record.serial)} · ${escapeHtml(record.name)} · ${escapeHtml(record.maker)}</option>`).join("") : '<option>Nenhum serial disponível</option>'}</select><button type="submit" ${availableProducts.length ? "" : "disabled"}>Atribuir serial</button></div>
        </form>
        <button class="account-state-button ${profile.blocked ? "activate" : "block"}" type="button" data-account-action="${profile.blocked ? "unblock" : "block"}" data-profile-id="${escapeHtml(profile.id)}">${profile.blocked ? "Reativar cadastro" : "Bloquear cadastro"}</button>
      </div>
      <div class="admin-action-feedback" id="admin-action-feedback" aria-live="polite"></div>
    </details>
    <div class="customer-detail-summary">
      <article><small>Primeiro registo</small><strong>${new Date(firstSeen || Date.now()).toLocaleString("pt-PT")}</strong></article>
      <article><small>Última atividade</small><strong>${new Date(profile.lastActive || Date.now()).toLocaleString("pt-PT")}</strong></article>
      <article><small>Seriais originais</small><strong>${products.length}</strong></article>
      <article><small>Nível e pontos</small><strong>${escapeHtml(profile.levelName || "Bronze")} · ${Number(profile.points || products.length * 100).toLocaleString("pt-PT")} pts</strong></article>
      <article><small>Benefícios ativos</small><strong>${(profile.benefits || []).length}</strong></article>
      <article><small>Consentimento comercial</small><strong>${marketingAllowed ? "Autorizado" : "Não autorizado"}</strong></article>
    </div>
    <details class="customer-detail-section"><summary>Preferências de privacidade</summary>
      <dl class="customer-metadata-grid consent-status-grid">
        <div><dt>Dados necessários</dt><dd>Ativos</dd></div>
        <div><dt>Dados de utilização</dt><dd>${analyticsAllowed ? "Autorizados" : "Não autorizados"}</dd></div>
        <div><dt>Localização aproximada pelo IP</dt><dd>${consent.location === true ? "Autorizada · região da conexão, não endereço de entrega" : "Não autorizada"}</dd></div><div><dt>Personalização</dt><dd>${consent.personalization === true ? "Autorizada" : "Não autorizada"}</dd></div>
        <div><dt>Marketing</dt><dd>${marketingAllowed ? "Autorizado" : "Não autorizado"}</dd></div>
        <div><dt>Data da decisão</dt><dd>${consent.decidedAt ? new Date(consent.decidedAt).toLocaleString("pt-PT") : "Sem decisão registada"}</dd></div>
        <div><dt>Elegibilidade</dt><dd>${marketingAllowed ? "Ofertas por pontos e benefícios" : "Sem comunicações promocionais"}</dd></div>
      </dl>
      <p class="privacy-boundary">Produtos e endereços IP permanecem restritos a autenticação, segurança e prevenção de fraude; não são utilizados para segmentar ofertas.</p>
    </details>
    <details class="customer-detail-section"><summary>Produtos associados ao perfil</summary>
      <div class="customer-product-list">${products.length ? products.map((product) => `<article><span class="medicine-icon">Rx</span><div><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.maker)} · Lote ${escapeHtml(product.lot)}</small><time datetime="${escapeHtml(product.verifiedAt)}">${product.verifiedAt ? new Date(product.verifiedAt).toLocaleString("pt-PT") : "Data indisponível"}</time></div><code>${escapeHtml(product.serial)}</code><span class="status-pill ${product.status === "authentic" ? "authentic" : "invalid"}">${product.status === "authentic" ? "Original" : "Invalidado"}</span><button class="serial-permission-button" type="button" data-serial-action="${product.status === "authentic" ? "revoke" : "restore"}" data-profile-id="${escapeHtml(profile.id)}" data-customer-serial="${escapeHtml(product.serial)}">${product.status === "authentic" ? "Invalidar neste cadastro" : "Restaurar serial"}</button></article>`).join("") : "<p>Nenhum produto associado.</p>"}</div>
    </details>
    <details class="customer-detail-section"><summary>Acessos e dispositivo</summary>
      <dl class="customer-metadata-grid">
        <div><dt>Endereços IP (segurança)</dt><dd>${escapeHtml(ips.join(", ") || "—")}</dd></div>
        <div><dt>Plataformas</dt><dd>${analyticsAllowed ? escapeHtml(platforms.join(", ") || "—") : "Não recolhido sem consentimento"}</dd></div>
        <div><dt>Fusos horários</dt><dd>${analyticsAllowed ? escapeHtml(timezones.join(", ") || "—") : "Não recolhido sem consentimento"}</dd></div>
        <div><dt>Total de eventos</dt><dd>${events.length}</dd></div>
        <div><dt>Último navegador</dt><dd>${escapeHtml(events[0]?.userAgent || "Não disponível")}</dd></div>
        <div><dt>Última origem</dt><dd>${escapeHtml(events[0]?.source || "—")} · ${escapeHtml(events[0]?.action || "—")}</dd></div>
      </dl>
    </details>
    <details class="customer-detail-section"><summary>Atividade recente</summary>
      <div class="profile-access-summary">${profileAccessSummary(profile)}</div>
      <div class="customer-event-list">${events.slice(0, 100).map((event) => `<article><time>${new Date(event.activatedAt).toLocaleString("pt-PT")}</time><strong>${escapeHtml(event.action || "verification")} · ${escapeHtml(event.source || "manual")}</strong><span>Serial ${escapeHtml(event.serial)} · ${escapeHtml(event.ip || "IP não disponível")} · ${escapeHtml(locationLabel(event))} · ${escapeHtml(event.browser || "")} / ${escapeHtml(event.os || "")}</span><button type="button" data-activity-id="${escapeHtml(String(event.id))}">Ver acesso</button></article>`).join("") || "<p>Nenhum evento central registado.</p>"}</div>
    </details>`;
  document.querySelector("#customer-detail-dialog").showModal();
}
document
  .querySelector("#panel-customers")
  .addEventListener("click", (event) => {
    const button = event.target.closest("[data-customer-details]");
    if (button) openCustomerDetail(button.dataset.customerDetails);
  });
document
  .querySelector("#close-customer-detail")
  .addEventListener("click", () =>
    document.querySelector("#customer-detail-dialog").close(),
  );
function logAdminCustomerAction() { /* The profile endpoint records changes atomically. */ }
function reopenCustomerDetail(profileId) {
  const detail = document.querySelector("#customer-detail-dialog");
  if (detail.open) detail.close();
  renderCustomers();
  openCustomerDetail(profileId);
}
const customerDetailContent = document.querySelector("#customer-detail-content");
customerDetailContent.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  const profileId = form.dataset.profileId;
  if (!profileId) return;
  if (form.id === "customer-rank-form") {
    const level = Number(form.querySelector("#customer-rank-select").value);
    const rank = CUSTOMER_RANKS.find((item) => item.level === level);
    if (!rank) return;
    const updated = await updateCustomer(profileId, (profile) => ({
      ...profile,
      rankOverride: rank.level,
      level: rank.level,
      levelName: rank.name,
      points: Math.max(Number(profile.points || 0), rank.points),
    }));
    if (updated) {
      saveCustomerRewardProfile(updated);
      logAdminCustomerAction(profileId, "rank_changed", { rank: rank.name });
      reopenCustomerDetail(profileId);
    }
  }
  if (form.id === "customer-serial-form") {
    const serial = form.querySelector("#customer-serial-select").value;
    const product = records.find((record) => record.serial === serial);
    if (!product) return;
    const updated = await updateCustomer(profileId, (profile) => {
      const serials = [...new Set([...(profile.serials || []), serial])];
      const revokedSerials = (profile.revokedSerials || []).filter(
        (item) => item !== serial,
      );
      return {
        ...profile,
        serials,
        revokedSerials,
        verifiedAt: {
          ...(profile.verifiedAt || {}),
          [serial]: new Date().toISOString(),
        },
        points: Math.max(Number(profile.points || 0), serials.length * 100),
      };
    });
    if (updated) {
      saveCustomerRewardProfile(updated);
      logAdminCustomerAction(profileId, "serial_assigned", {
        serial,
        product: product.name,
      });
      reopenCustomerDetail(profileId);
    }
  }
});
customerDetailContent.addEventListener("click", async (event) => {
  const accountButton = event.target.closest("[data-account-action]");
  if (accountButton) {
    const profileId = accountButton.dataset.profileId;
    const blocked = accountButton.dataset.accountAction === "block";
    const updated = await updateCustomer(profileId, (profile) => ({
      ...profile,
      blocked,
      blockedAt: blocked ? new Date().toISOString() : null,
    }));
    if (updated) {
      logAdminCustomerAction(profileId, blocked ? "account_blocked" : "account_unblocked");
      reopenCustomerDetail(profileId);
    }
    return;
  }
  const serialButton = event.target.closest("[data-serial-action]");
  if (!serialButton) return;
  const profileId = serialButton.dataset.profileId;
  const serial = serialButton.dataset.customerSerial;
  const revoke = serialButton.dataset.serialAction === "revoke";
  const updated = await updateCustomer(profileId, (profile) => {
    const revoked = new Set(profile.revokedSerials || []);
    if (revoke) revoked.add(serial);
    else revoked.delete(serial);
    return { ...profile, revokedSerials: [...revoked] };
  });
  if (updated) {
    saveCustomerRewardProfile(updated);
    logAdminCustomerAction(profileId, revoke ? "serial_revoked" : "serial_restored", { serial });
    reopenCustomerDetail(profileId);
  }
});
document.querySelector("#product-suggestions").innerHTML = [
  ...new Set(seeds.map((x) => x.name)),
]
  .map((x) => `<option value="${x.replace(/"/g, "&quot;")}"></option>`)
  .join("");
document
  .querySelectorAll("[data-admin-lang]")
  .forEach((b) =>
    b.addEventListener("click", () => setLanguage(b.dataset.adminLang)),
  );
document.querySelector("#admin-search").addEventListener("input", (e) => {
  filter = e.target.value;
  render();
});
document.querySelector("#customer-search").addEventListener("input", (e) => {
  customerFilter = e.target.value;
  customerPage=1;
  clearTimeout(searchTimer);searchTimer=setTimeout(()=>loadRemoteVerifications().catch(e=>adminNotice(e.message)),300);
});
document
  .querySelector("#refresh-customers")
  .addEventListener("click", () => loadRemoteVerifications().catch(error=>adminNotice(error.message)));
window.addEventListener("storage", (event) => {
  if (event.key === "vf-customer-registry") renderCustomers();
});
function renderRemoteVerifications(payload) {
 if(payload) {
  remoteVerifications=payload.records || [];
  remoteCustomerProfiles=payload.profiles || remoteCustomerProfiles;
 }
 renderActivity(payload); renderCustomers();
}
async function loadRemoteVerifications() {
 const response=await fetch(`/api/admin/dashboard?${activityQuery()}`,{credentials:'same-origin',cache:'no-store'});
 if(response.status===401) {lockAdmin();throw new Error('Sessão expirada');}
 if(!response.ok) throw new Error('Não foi possível carregar os registros centrais.');
 renderRemoteVerifications(await response.json());
}
document.querySelector("#serial-generator").addEventListener("submit", async (e) => {
  e.preventDefault();
  const length = Number(document.querySelector("#serial-length").value);
  let serial;
  do {
    serial = Array.from(
      { length },
      () => crypto.getRandomValues(new Uint32Array(1))[0] % 10,
    ).join("");
  } while (records.some((x) => x.serial === serial));
  const product = document.querySelector("#product-name").value.trim(),
    dose = document.querySelector("#product-dose").value.trim();
  const row = {
    serial,
    name: `${product} ${dose}`,
    maker: document.querySelector("#product-maker").value.trim(),
    lot: document.querySelector("#product-lot").value.trim(),
    expiry: "12/2027",
    status: "authentic",
  };
  if(!await save(row)) return;
  const out = document.querySelector("#generated-output");
  out.className = "generated-output show";
  out.innerHTML = `${words[lang].generated}<strong>${serial}</strong>`;
  e.target.reset();
});
document.querySelector("#admin-body").addEventListener("click", async (e) => {
  const qr = e.target.closest("[data-qr]");
  if (qr) {
    try {await showQr(qr.dataset.qr);} catch(error){adminNotice(error.message);}
    return;
  }
  const button = e.target.closest("[data-serial]");
  if (!button) return;
  const row = records.find((x) => x.serial === button.dataset.serial);
  if (row) {
    row.status = button.dataset.state;
    await save(row);
  }
});
const dialog = document.querySelector("#qr-dialog"),
  canvas = document.querySelector("#qr-canvas");
let current = "";
async function qrRequest(serial,intent) {
 const response=await fetch('/api/admin/qr',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({serial,intent})});
 if(!response.ok) throw new Error('Não foi possível registrar o pedido de QR Code. Tente novamente.');
 return response.json();
}
async function showQr(serial) {
  const issued=await qrRequest(serial,'view');
  const row = records.find((x) => x.serial === serial);
  current = serial;
  document.querySelector("#qr-serial").textContent = serial;
  document.querySelector("#qr-product").textContent = row
    ? `${row.name} · ${row.maker}`
    : "";
  dialog.showModal();
  canvas.innerHTML = "";
  if (window.QRCode)
    new QRCode(canvas, {
      text: new URL(issued.path,location.origin).href,
      width: 230,
      height: 230,
      colorDark: "#071b42",
      colorLight: "#fff",
      correctLevel: QRCode.CorrectLevel.H,
    });
}
document
  .querySelector("#close-qr")
  .addEventListener("click", () => dialog.close());
document.querySelector("#download-qr").addEventListener("click", async () => {
  try {await qrRequest(current,'download');}catch(error){adminNotice(error.message);return;}
  const source = canvas.querySelector("canvas"),
    image = canvas.querySelector("img"),
    link = document.createElement("a");
  link.download = `save-concept-${current}.png`;
  link.href = source ? source.toDataURL("image/png") : image?.src;
  if (link.href) link.click();
});
setLanguage(lang);

const adminSignatureVial = document.querySelector("#admin-signature-vial"),
  adminVialFlip = document.querySelector("#admin-vial-flip"),
  adminSignatureQr = document.querySelector("#admin-signature-qr");
if (window.QRCode && adminSignatureQr)
  new QRCode(adminSignatureQr, {
    text: `${location.origin}${location.pathname.replace(/admin\.html$/, "")}?serial=35172`,
    width: 150,
    height: 150,
    colorDark: "#071b42",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.H,
  });
adminVialFlip?.addEventListener("click", () => {
  const flipped = adminSignatureVial.classList.toggle("is-flipped");
  adminVialFlip.setAttribute("aria-pressed", String(flipped));
});
adminVialFlip?.addEventListener("pointerenter", (event) => {
  if (event.pointerType !== "mouse") return;
  adminSignatureVial.classList.add("is-flipped");
  adminVialFlip.setAttribute("aria-pressed", "true");
});
adminVialFlip?.addEventListener("pointerleave", (event) => {
  if (event.pointerType !== "mouse") return;
  adminSignatureVial.classList.remove("is-flipped");
  adminVialFlip.setAttribute("aria-pressed", "false");
});

document.addEventListener("click", (event) => {
  if (!event.target.closest("button, a, select, [role='button']")) return;
  document.body.classList.remove("ui-transitioning");
  requestAnimationFrame(() => document.body.classList.add("ui-transitioning"));
  window.setTimeout(() => document.body.classList.remove("ui-transitioning"), 520);
});

const adminReduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
if (!adminReduceMotion.matches && matchMedia("(pointer: fine)").matches) {
  document
    .querySelectorAll(".generator-card, .customer-dashboard, .admin-summary article, .customer-summary article")
    .forEach((card) => {
      card.addEventListener("pointermove", (event) => {
        const rect = card.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width - 0.5;
        const y = (event.clientY - rect.top) / rect.height - 0.5;
        const strength = card.matches("article") ? 3.2 : 1.2;
        card.style.setProperty("--depth-x", `${y * -strength}deg`);
        card.style.setProperty("--depth-y", `${x * strength}deg`);
      });
      card.addEventListener("pointerleave", () => {
        card.style.setProperty("--depth-x", "0deg");
        card.style.setProperty("--depth-y", "0deg");
      });
    });
}

document.querySelector('#customer-detail-content').addEventListener('click',async event=>{
 const button=event.target.closest('[data-confirm-benefit]');if(!button)return;
 if(!confirm('O vendedor confirmou a utilização deste código? Esta ação registra o resgate.'))return;
 button.disabled=true;
 try {const response=await fetch('/api/admin/benefits',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({profileId:button.dataset.profileId,code:button.dataset.confirmBenefit})});if(!response.ok)throw new Error('Não foi possível confirmar. Atualize o perfil e confira a elegibilidade.');reopenCustomerDetail(button.dataset.profileId);}catch(error){adminNotice(error.message);button.disabled=false;}
});
