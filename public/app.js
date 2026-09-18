function safeParse(raw, fallback) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}
const CONSENT_KEY = "vf-consent-v1";
function loadConsent() {
  return safeParse(localStorage.getItem(CONSENT_KEY), {
    necessary: true,
    analytics: false,
    personalization: false,
    marketing: false,
    decidedAt: "",
    version: 1,
  });
}
function saveConsent(next) {
  const consent = { necessary: true, analytics: false, personalization: false, marketing: false, ...next, decidedAt: new Date().toISOString(), version: 1 };
  localStorage.setItem(CONSENT_KEY, JSON.stringify(consent));
  document.querySelector("#consent-banner")?.setAttribute("hidden", "");
  if (session && remoteProfile) void syncCustomerProfile(loadProfile()).catch(error => { result.className = "result show warning"; result.textContent = error.message; });
  return consent;
}
function loadRecords() { return []; }
// The old flat digit-serial catalog endpoint (/api/catalog) is gone —
// license/material info now travels inside the profile response itself
// (see applyRemoteProfile), so there is nothing left to separately fetch.
async function refreshCatalog() {}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}
let remoteProfile = null;
// License serials are never re-displayed in full once issued (SHOW ONCE
// applies to the customer's own history too, not just the admin panel) —
// `profile.licenses[].serial` from the server is already the masked form
// (e.g. "CURA-••••-••••-••••-3HZQ"), so it doubles safely as the row's
// display identifier here.
function applyRemoteProfile(profile) {
  if (!profile) return;
  remoteProfile = profile;
  const claimed = Object.fromEntries((profile.benefits || []).map(item => [item.threshold, item]));
  const licenses = profile.licenses || [];
  records = licenses.map(license => ({ serial: license.serial, name: license.material?.name || "", maker: license.material?.brand || "", lot: license.lot || "" }));
  const verifiedAt = {};
  licenses.forEach(license => { if (license.activatedAt) verifiedAt[license.serial] = license.activatedAt; });
  saveProfile({ verified: licenses.filter(license => license.status === "active").map(license => license.serial), verifiedAt, claimed });
}
let presenceHeartbeatTimer = null;
function startPresenceHeartbeat() {
  stopPresenceHeartbeat();
  const ping = () => { if (session) fetch("/api/profiles/heartbeat", { method: "POST" }).catch(() => {}); };
  ping();
  presenceHeartbeatTimer = setInterval(ping, 60000);
}
function stopPresenceHeartbeat() {
  if (presenceHeartbeatTimer) clearInterval(presenceHeartbeatTimer);
  presenceHeartbeatTimer = null;
}
function lockSession(message) {
  session = "";
  remoteProfile = null;
  stopPresenceHeartbeat();
  localStorage.removeItem("vf-user-session");
  document.querySelector("#login-gate").classList.remove("hidden");
  document.querySelector("#login-error").textContent = message;
}
async function requireResponse(response) {
  if (response.status === 401 || response.status === 403) {
    lockSession("Sessão indisponível ou cadastro bloqueado. Entre novamente ou contate o suporte.");
  }
  if (!response.ok) throw new Error("Não foi possível concluir a solicitação. Verifique sua conexão e tente novamente.");
  return response.json();
}
let records = loadRecords(),
  language = localStorage.getItem("vf-language") || "pt",
  history = safeParse(localStorage.getItem("vf-history"), []),
  session = localStorage.getItem("vf-user-session") || "",
  scanMode = "verify";
const input = document.querySelector("#serial"),
  loginInput = document.querySelector("#login-serial"),
  count = document.querySelector("#digit-count"),
  loginCount = document.querySelector("#login-count"),
  result = document.querySelector("#result"),
  historyBody = document.querySelector("#history-body");
const t = {
  pt: {
    locale: "pt-PT",
    navVerify: "Verificar",
    navHistory: "Histórico",
    navAdmin: "Painel administrativo",
    install: "Instalar app",
    heroTitle: "O seu produto.<br><em>A sua segurança.</em>",
    heroText:
      "Valide novos produtos e acumule bónus na sua conta Save Concept.",
    verifyTitle: "Verifique o seu produto",
    verifyHint:
      "Introduza o código de licença indicado no selo de segurança (ex.: CURA-XXXX-XXXX-XXXX-XXXX).",
    serialLabel: "Código de licença",
    serialHelp: "Letras e números, no formato XXXX-XXXX-XXXX-XXXX-XXXX.",
    checkSerial: "Consultar serial",
    scanQr: "Ler QR Code",
    share: "Partilhar ligação de convite",
    recent: "CONSULTAS RECENTES",
    historyTitle: "Histórico de verificações",
    clearHistory: "Limpar histórico",
    empty: "As suas consultas aparecerão aqui.",
    valid: "Produto original e validado",
    missing: "Serial não encontrado",
    blocked: "QR Code invalidado",
    invalid: "Introduza um código de licença válido.",
    batch: "Lote",
    expiry: "Validade",
    loginError: "Este serial não corresponde a um produto validado.",
    duplicate: "Este serial já foi contabilizado nos seus bónus.",
    added: "Serial adicionado ao seu progresso.",
    remaining: (n) =>
      `Faltam ${n} seriais diferentes para desbloquear o cupão de 50%.`,
    ready: "O cupão de 50% já está disponível para resgate.",
    redeem: "Resgatar",
    claimed: "Resgatado",
  },
  en: {
    locale: "en-GB",
    navVerify: "Verify",
    navHistory: "History",
    navAdmin: "Admin panel",
    install: "Install app",
    heroTitle: "Your product.<br><em>Your rewards.</em>",
    heroText:
      "Validate new products and earn rewards in your Save Concept account.",
    verifyTitle: "Verify your product",
    verifyHint:
      "Enter the license code shown on the security seal (e.g. CURA-XXXX-XXXX-XXXX-XXXX).",
    serialLabel: "License code",
    serialHelp: "Letters and numbers, formatted as XXXX-XXXX-XXXX-XXXX-XXXX.",
    checkSerial: "Check serial",
    scanQr: "Scan QR Code",
    share: "Share invitation link",
    recent: "RECENT CHECKS",
    historyTitle: "Verification history",
    clearHistory: "Clear history",
    empty: "Your checks will appear here.",
    valid: "Genuine and validated product",
    missing: "Serial not found",
    blocked: "QR Code invalidated",
    invalid: "Enter a valid license code.",
    batch: "Batch",
    expiry: "Expiry",
    loginError: "This serial does not belong to a validated product.",
    duplicate: "This serial has already counted towards your rewards.",
    added: "Serial added to your progress.",
    remaining: (n) => `${n} different serials left to unlock the 50% coupon.`,
    ready: "Your 50% coupon is ready to redeem.",
    redeem: "Redeem",
    claimed: "Claimed",
  },
  es: {
    locale: "es-PY",
    navVerify: "Verificar",
    navHistory: "Historial",
    navAdmin: "Panel administrativo",
    install: "Instalar app",
    heroTitle: "Tu producto.<br><em>Tus beneficios.</em>",
    heroText:
      "Valida nuevos productos y acumula beneficios en tu cuenta Save Concept.",
    verifyTitle: "Verifica tu producto",
    verifyHint: "Ingresa el código de licencia indicado en el sello (ej.: CURA-XXXX-XXXX-XXXX-XXXX).",
    serialLabel: "Código de licencia",
    serialHelp: "Letras y números, en el formato XXXX-XXXX-XXXX-XXXX-XXXX.",
    checkSerial: "Consultar serial",
    scanQr: "Escanear QR",
    share: "Compartir enlace",
    recent: "CONSULTAS RECIENTES",
    historyTitle: "Historial de verificaciones",
    clearHistory: "Limpiar historial",
    empty: "Tus consultas aparecerán aquí.",
    valid: "Producto original y validado",
    missing: "Serial no encontrado",
    blocked: "QR invalidado",
    invalid: "Ingresa un código de licencia válido.",
    batch: "Lote",
    expiry: "Vencimiento",
    loginError: "Este serial no corresponde a un producto validado.",
    duplicate: "Este serial ya fue contabilizado.",
    added: "Serial agregado a tu progreso.",
    remaining: (n) =>
      `Faltan ${n} seriales diferentes para desbloquear el cupón del 50%.`,
    ready: "Tu cupón del 50% está disponible.",
    redeem: "Canjear",
    claimed: "Canjeado",
  },
};
const loginText = {
  pt: {
    kicker: "ACESSO DO CLIENTE",
    title: "Entre com um produto validado",
    copy: "Utilize o serial ou o QR Code de qualquer produto Save Concept já validado.",
    serial: "Código de licença",
    help: "Aceita o código de licença completo, incluindo os traços.",
    button: "Entrar com serial",
    qr: "Entrar com QR Code",
    instructions: "Como faço para validar?",
    visualTitle: "Veja a parte traseira",
    visualCopy: "O QR Code encontra-se no selo e o serial aparece logo abaixo.",
  },
  en: {
    kicker: "CUSTOMER ACCESS",
    title: "Sign in with a validated product",
    copy: "Use the serial or QR Code from any validated Save Concept product.",
    serial: "License code",
    help: "Accepts the full license code, including the dashes.",
    button: "Sign in with serial",
    qr: "Sign in with QR Code",
    instructions: "How do I validate?",
    visualTitle: "Check the back of the product",
    visualCopy:
      "The QR Code is on the seal and the serial appears directly below it.",
  },
  es: {
    kicker: "ACCESO DEL CLIENTE",
    title: "Ingresa con un producto validado",
    copy: "Usa el serial o QR de cualquier producto Save Concept validado.",
    serial: "Código de licencia",
    help: "Acepta el código de licencia completo, incluidos los guiones.",
    button: "Ingresar con serial",
    qr: "Ingresar con QR",
    instructions: "¿Cómo valido mi producto?",
    visualTitle: "Mira la parte trasera",
    visualCopy: "El QR está en el sello y el serial aparece justo debajo.",
  },
};
if (!t[language]) language = "pt";
const tutorialText = {
  pt: {
    only: "SOMENTE UTILIZADORES COM PRODUTOS ORIGINAIS E VERIFICADOS TERÃO ACESSO",
    s1t: "Vire a embalagem",
    s1c: "Localize o selo branco na parte traseira.",
    s2t: "Encontre o código",
    s2c: "O QR Code fica ao centro e o serial logo abaixo.",
    s3t: "Entre com segurança",
    s3c: "Digite o serial ou use a câmara para ler o QR Code.",
  },
  en: {
    only: "ONLY USERS WITH ORIGINAL, VERIFIED PRODUCTS WILL HAVE ACCESS",
    s1t: "Turn the package over",
    s1c: "Find the white seal on the back.",
    s2t: "Find the code",
    s2c: "The QR Code is in the centre with the serial directly below.",
    s3t: "Sign in securely",
    s3c: "Enter the serial or use your camera to scan the QR Code.",
  },
  es: {
    only: "SOLO LOS USUARIOS CON PRODUCTOS ORIGINALES Y VERIFICADOS TENDRÁN ACCESO",
    s1t: "Gira el envase",
    s1c: "Localiza el sello blanco en la parte trasera.",
    s2t: "Encuentra el código",
    s2c: "El QR está en el centro y el serial justo debajo.",
    s3t: "Ingresa con seguridad",
    s3c: "Escribe el serial o usa la cámara para leer el QR.",
  },
};
Object.assign(t.pt, {
  recent: "PRODUTOS VERIFICADOS",
  historyTitle: "Todos os seus produtos",
  historyNote: "O seu histórico fica guardado e não pode ser apagado.",
  historyCountLabel: "verificados",
  productColumn: "Produto Save Concept",
  verifiedDate: "Data da verificação",
  bonusTitle: "Os seus bónus",
  bonusIntro:
    "Cada produto original soma 100 pontos e aproxima-o do próximo nível.",
  currentLevel: "NÍVEL ATUAL",
  remaining: (n) =>
    `Faltam ${n} frascos diferentes para desbloquear o frasco grátis.`,
  ready:
    "Completou as três recompensas iniciais. Continue a validar para subir de nível.",
  nextPoints: (n, name) => `${n.toLocaleString("pt-PT")} pts para ${name}`,
  maxLevel: "Nível máximo alcançado",
  walletEyebrow: "NA SUA CONTA",
  walletTitle: "Benefícios ativos",
  walletIntro:
    "Os benefícios resgatados ficam disponíveis aqui para utilizar no próximo pedido.",
  activeLabel: "ativos",
  walletEmpty: "Ainda não há benefícios ativos.",
  activated: "Ativado na conta",
  copyCode: "Copiar código",
  copied: "Código copiado",
  levelShort: "Nível",
  benefitsShort: "benefícios",
  logout: "Sair",
  supportButton: "Ajuda",
  supportTitle: "Como podemos ajudar?",
  supportStep1Title: "Encontre o selo",
  supportStep1Copy: "O QR Code e o serial estão juntos na parte traseira da embalagem.",
  supportStep2Title: "Consulte o serial",
  supportStep2Copy: "Digite o código de licença, ou utilize a câmara para ler o QR Code.",
  supportStep3Title: "Confira o resultado",
  supportStep3Copy: "Produto, dosagem, farmácia, lote e estado devem aparecer na confirmação.",
  supportScan: "Abrir leitor de QR Code",
});
Object.assign(t.en, {
  recent: "VERIFIED PRODUCTS",
  historyTitle: "All your products",
  historyNote: "Your verification history is saved permanently.",
  historyCountLabel: "verified",
  productColumn: "Save Concept product",
  verifiedDate: "Verification date",
  bonusTitle: "Your rewards",
  bonusIntro:
    "Each genuine product adds 100 points and brings you closer to the next level.",
  currentLevel: "CURRENT LEVEL",
  remaining: (n) => `${n} different bottles left to unlock the free bottle.`,
  ready:
    "You completed the three starter rewards. Keep validating to level up.",
  nextPoints: (n, name) => `${n.toLocaleString("en-GB")} pts to ${name}`,
  maxLevel: "Maximum level reached",
  walletEyebrow: "IN YOUR ACCOUNT",
  walletTitle: "Active benefits",
  walletIntro: "Redeemed benefits remain available here for your next order.",
  activeLabel: "active",
  walletEmpty: "No active benefits yet.",
  activated: "Activated in account",
  copyCode: "Copy code",
  copied: "Code copied",
  levelShort: "Level",
  benefitsShort: "benefits",
  logout: "Sign out",
  supportButton: "Help",
  supportTitle: "How can we help?",
  supportStep1Title: "Find the seal",
  supportStep1Copy: "The QR Code and serial are together on the back of the package.",
  supportStep2Title: "Check the serial",
  supportStep2Copy: "Enter the license code, or use the camera to scan the QR Code.",
  supportStep3Title: "Review the result",
  supportStep3Copy: "The product, dose, pharmacy, batch and status must appear in the confirmation.",
  supportScan: "Open QR Code scanner",
});
Object.assign(t.es, {
  recent: "PRODUCTOS VERIFICADOS",
  historyTitle: "Todos tus productos",
  historyNote: "Tu historial de verificaciones queda guardado permanentemente.",
  historyCountLabel: "verificados",
  productColumn: "Producto Save Concept",
  verifiedDate: "Fecha de verificación",
  bonusTitle: "Tus beneficios",
  bonusIntro:
    "Cada producto original suma 100 puntos y te acerca al siguiente nivel.",
  currentLevel: "NIVEL ACTUAL",
  remaining: (n) =>
    `Faltan ${n} frascos diferentes para desbloquear el frasco gratis.`,
  ready:
    "Completaste las tres recompensas iniciales. Sigue verificando para subir de nivel.",
  nextPoints: (n, name) => `${n.toLocaleString("es-PY")} pts para ${name}`,
  maxLevel: "Nivel máximo alcanzado",
  walletEyebrow: "EN TU CUENTA",
  walletTitle: "Beneficios activos",
  walletIntro:
    "Los beneficios canjeados quedan disponibles aquí para tu próximo pedido.",
  activeLabel: "activos",
  walletEmpty: "Todavía no hay beneficios activos.",
  activated: "Activado en la cuenta",
  copyCode: "Copiar código",
  copied: "Código copiado",
  levelShort: "Nivel",
  benefitsShort: "beneficios",
  logout: "Salir",
  supportButton: "Ayuda",
  supportTitle: "¿Cómo podemos ayudarte?",
  supportStep1Title: "Encuentra el sello",
  supportStep1Copy: "El QR y el serial están juntos en la parte trasera del envase.",
  supportStep2Title: "Consulta el serial",
  supportStep2Copy: "Ingresa el código de licencia o usa la cámara para leer el QR.",
  supportStep3Title: "Revisa el resultado",
  supportStep3Copy: "Producto, dosis, farmacia, lote y estado deben aparecer en la confirmación.",
  supportScan: "Abrir lector de QR",
});
// License format: PREFIX-XXXX-XXXX-XXXX-XXXX (prefix: 2-10 letters/digits,
// identification only; each segment: 4 chars from a 32-symbol alphabet that
// excludes I/L/O/U to avoid visual ambiguity — see lib/serial.ts).
const SERIAL_PATTERN = /^[A-Z0-9]{2,10}(?:-[0-9A-HJKMNPQRSTVWXYZ]{4}){4}$/;
// Same shape, unanchored — for pulling a code out of a scanned QR payload
// or a `?serial=` URL rather than validating a whole input value.
const SERIAL_PATTERN_LOOSE = /[A-Z0-9]{2,10}(?:-[0-9A-HJKMNPQRSTVWXYZ]{4}){4}/;
function clean(v) {
  return v.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 30);
}
function validSerial(v) {
  return SERIAL_PATTERN.test(v);
}
function customerRecord() { return remoteProfile; }
function profileKey() {
  return `vf-rewards-profile-v3-${session || "guest"}`;
}
function loadProfile() {
  let p = safeParse(localStorage.getItem(profileKey()), null);
  if (!p) {
    const legacy = safeParse(
      localStorage.getItem("vf-rewards-profile-v2"),
      null,
    );
    const migratedTo = localStorage.getItem("vf-rewards-profile-v2-migrated-to");
    p =
      legacy && session && !migratedTo
        ? {
            verified: [...(legacy.verified || [])],
            claimed: { ...(legacy.claimed || {}) },
            verifiedAt: { ...(legacy.verifiedAt || {}) },
          }
        : { verified: [], claimed: {}, verifiedAt: {} };
    if (legacy && session && !migratedTo)
      localStorage.setItem("vf-rewards-profile-v2-migrated-to", session);
  }
  p.verified = Array.isArray(p.verified) ? p.verified : [];
  p.claimed = p.claimed || {};
  p.verifiedAt = p.verifiedAt || {};
  p.verified.forEach((serial) => {
    if (!p.verifiedAt[serial]) {
      const old = history.find((x) => x.serial === serial && x.timestamp);
      p.verifiedAt[serial] = old?.timestamp || new Date().toISOString();
    }
  });
  saveProfile(p);
  return p;
}
function saveProfile(p) {
  localStorage.setItem(profileKey(), JSON.stringify(p));
}
function showApp(profileId) {
  session = profileId;
  localStorage.setItem("vf-user-session", profileId);
  document.querySelector("#login-gate").classList.add("hidden");
  // The account id is an internal opaque identifier now (never the license
  // serial itself) — shown shortened since the full form is a long UUID.
  document.querySelector("#user-serial").textContent = profileId ? `••${profileId.slice(-8)}` : "";
  renderRewards();
  renderHistory();
  startPresenceHeartbeat();
}
async function loginWith(serial, source = "manual") {
  const error = document.querySelector("#login-error");
  if (!validSerial(serial)) { error.textContent = t[language].loginError; return false; }
  const button = document.querySelector('#login-form button[type="submit"]');
  if (button) button.disabled = true;
  error.textContent = "Verificando…";
  try {
    const response = await fetch("/api/profiles/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ serial }) });
    const data = await requireResponse(response);
    // The login endpoint already claims/validates the license and credits
    // points server-side in one atomic step — no separate /api/verifications
    // call is needed (or correct) for the serial that was just logged in with.
    applyRemoteProfile(data.profile);
    showApp(data.profile.id);
    error.textContent = "";
    return true;
  } catch (failure) {
    lockSession(failure.message);
    return false;
  } finally { if (button) button.disabled = false; }
}
document.querySelector("#login-form").addEventListener("submit", (e) => {
  e.preventDefault();
  loginWith(clean(loginInput.value), "manual").catch(() => {});
});
loginInput.addEventListener("input", () => {
  loginInput.value = clean(loginInput.value);
  loginCount.textContent = `${loginInput.value.length}`;
  document.querySelector("#login-error").textContent = "";
});
document.querySelector("#logout").addEventListener("click", async () => {
  try {
    await requireResponse(await fetch("/api/profiles/session", { method: "DELETE" }));
    lockSession("");
    location.reload();
  } catch (failure) { lockSession(failure.message); }
});
function renderHistory() {
  const p = session ? loadProfile() : { verified: [], verifiedAt: {} },
    items = p.verified
      .map((serial) => {
        const item = records.find((x) => x.serial === serial) || {
          serial,
          name: "—",
          maker: "",
          lot: "—",
          status: "authentic",
        };
        return { ...item, timestamp: p.verifiedAt[serial] };
      })
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  document.querySelector("#history-count").textContent = items.length;
  historyBody.innerHTML = items.length
    ? items
        .map(
          (x) =>
            `<tr><td><strong>${escapeHtml(x.serial)}</strong></td><td>${escapeHtml(x.name)}<small style="display:block;color:#718095">${escapeHtml(x.maker || "")}</small></td><td>${escapeHtml(x.lot || "—")}</td><td><time datetime="${escapeHtml(x.timestamp)}">${new Date(x.timestamp).toLocaleString(t[language].locale, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</time></td><td><span class="status-pill authentic">${t[language].valid}</span></td></tr>`,
        )
        .join("")
    : `<tr class="empty-row"><td colspan="5">${t[language].empty}</td></tr>`;
}
function setLanguage(lang) {
  language = lang;
  localStorage.setItem("vf-language", lang);
  document.documentElement.lang = t[lang].locale;
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    if (t[lang][el.dataset.i18n]) el.textContent = t[lang][el.dataset.i18n];
  });
  document.querySelectorAll("[data-i18n-html]").forEach((el) => {
    if (t[lang][el.dataset.i18nHtml])
      el.innerHTML = t[lang][el.dataset.i18nHtml];
  });
  const l = loginText[lang],
    loginIds = {
      kicker: "login-kicker",
      title: "login-title",
      copy: "login-copy",
      serial: "login-serial-label",
      help: "login-help",
      button: "login-button-label",
      qr: "login-qr-label",
      instructions: "instructions-label",
      visualTitle: "visual-title",
      visualCopy: "visual-copy",
    };
  Object.entries(loginIds).forEach(
    ([key, id]) => (document.getElementById(id).textContent = l[key]),
  );
  const steps = tutorialText[lang],
    stepIds = {
      only: "original-only",
      s1t: "step1-title",
      s1c: "step1-copy",
      s2t: "step2-title",
      s2c: "step2-copy",
      s3t: "step3-title",
      s3c: "step3-copy",
    };
  Object.entries(stepIds).forEach(
    ([key, id]) => (document.getElementById(id).textContent = steps[key]),
  );
  document
    .querySelectorAll("[data-lang]")
    .forEach((b) => b.classList.toggle("active", b.dataset.lang === lang));
  renderHistory();
  if (session) renderRewards();
}
document
  .querySelectorAll("[data-lang]")
  .forEach((b) =>
    b.addEventListener("click", () => setLanguage(b.dataset.lang)),
  );
input.addEventListener("input", () => {
  input.value = clean(input.value);
  count.textContent = `${input.value.length}`;
  result.className = "result";
  result.innerHTML = "";
});
document.querySelector("#verify-form").addEventListener("submit", (e) => {
  e.preventDefault();
  verify(clean(input.value), "manual");
});
async function verify(serial, source = "manual") {
  if (!validSerial(serial)) {
    result.className = "result show invalid";
    result.textContent = t[language].invalid;
    input.focus();
    return;
  }
  const button = document.querySelector('#verify-form button[type="submit"]');
  if (button) button.disabled = true;
  result.className = "result show";
  result.textContent = "Consultando o servidor…";
  try {
    await refreshCatalog();
    const data = await recordRemoteVerification({ serial, action: "verification", source });
    if (data.product) records = [...records.filter(row => row.serial !== serial), data.product];
    const item = data.product || records.find(row => row.serial === serial) || { serial, name: "", maker: "", lot: "", expiry: "" };
    if (data.status === "not_found") {
      result.className = "result show warning";
      result.textContent = t[language].missing;
    } else if (data.status !== "authentic") {
      result.className = "result show invalid";
      result.textContent = t[language].blocked;
    } else {
      result.className = "result show authentic";
      result.innerHTML = `<strong>✓ ${t[language].valid}</strong>${escapeHtml(item.name)}<br>${escapeHtml(item.maker)} · ${t[language].batch} ${escapeHtml(item.lot)} · ${t[language].expiry} ${escapeHtml(item.expiry)}<br><small>${data.credited ? t[language].added : t[language].duplicate}</small>`;
    }
    renderRewards();
    renderHistory();
  } catch (failure) {
    result.className = "result show warning";
    result.textContent = failure.message;
  } finally { if (button) button.disabled = false; }
}
function auditMetadata() {
  const consent = loadConsent();
  const connection =
    navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const essential = {
    consent: {
      analytics: Boolean(consent.analytics),
      personalization: Boolean(consent.personalization),
      marketing: Boolean(consent.marketing),
      decidedAt: consent.decidedAt || "",
      version: consent.version || 1,
    },
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
    locale: navigator.language || "",
    page: location.pathname,
  };
  if (!consent.analytics) return essential;
  return {
    ...essential,
    languages: Array.isArray(navigator.languages)
      ? navigator.languages.slice(0, 5)
      : [],
    platform: navigator.userAgentData?.platform || navigator.platform || "",
    mobile: navigator.userAgentData?.mobile ?? null,
    screen: {
      width: screen.width,
      height: screen.height,
      colorDepth: screen.colorDepth,
      pixelRatio: window.devicePixelRatio || 1,
    },
    viewport: { width: innerWidth, height: innerHeight },
    cookiesEnabled: navigator.cookieEnabled,
    doNotTrack: navigator.doNotTrack || "",
    online: navigator.onLine,
    connection: connection
      ? {
          effectiveType: connection.effectiveType || "",
          downlink: Number(connection.downlink) || null,
          rtt: Number(connection.rtt) || null,
          saveData: Boolean(connection.saveData),
        }
      : null,
    referrer: document.referrer.slice(0, 500),
  };
}
async function recordRemoteVerification(item) {
  const response = await fetch("/api/verifications", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ serial: item.serial, profileId: session, language, action: item.action || "verification", source: item.source || "manual", metadata: auditMetadata() }),
  });
  const data = await requireResponse(response);
  applyRemoteProfile(data.profile);
  return data;
}
const LEVELS = [
  {
    name: { pt: "Essencial", en: "Essential", es: "Esencial" },
    points: 0,
    prize: {
      pt: "Envio grátis, 50% OFF e 1 frasco grátis",
      en: "Free shipping, 50% off and 1 free bottle",
      es: "Envío gratis, 50% OFF y 1 frasco gratis",
    },
  },
  {
    name: { pt: "Prata", en: "Silver", es: "Plata" },
    points: 1000,
    prize: {
      pt: "Ciclos com até 2 frascos grátis",
      en: "Cycles with up to 2 free bottles",
      es: "Ciclos con hasta 2 frascos gratis",
    },
  },
  {
    name: { pt: "Ouro", en: "Gold", es: "Oro" },
    points: 2000,
    prize: {
      pt: "Ciclos com até 3 frascos grátis",
      en: "Cycles with up to 3 free bottles",
      es: "Ciclos con hasta 3 frascos gratis",
    },
  },
  {
    name: { pt: "Platina", en: "Platinum", es: "Platino" },
    points: 3000,
    prize: {
      pt: "Envio expresso e prémios premium",
      en: "Express shipping and premium rewards",
      es: "Envío exprés y premios premium",
    },
  },
  {
    name: { pt: "Diamante", en: "Diamond", es: "Diamante" },
    points: 5000,
    prize: {
      pt: "Pague 1, leve 3 e atendimento VIP",
      en: "Buy 1, get 3 and VIP support",
      es: "Paga 1, lleva 3 y atención VIP",
    },
  },
];
function getLevelIndex(points) {
  let index = 0;
  LEVELS.forEach((entry, i) => {
    if (points >= entry.points) index = i;
  });
  return index;
}
async function syncCustomerProfile(p) {
  if (!session || !remoteProfile) return;
  const response = await fetch("/api/profiles", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: session, preferredLanguage: language, consent: loadConsent(), benefits: Object.entries(p.claimed).map(([threshold, item]) => ({ ...item, threshold: Number(threshold) })) }),
  });
  const data = await requireResponse(response);
  if (data.profile) applyRemoteProfile(data.profile);
  else {
    const latest = await requireResponse(await fetch(`/api/profiles?id=${encodeURIComponent(session)}`, { cache: "no-store" }));
    applyRemoteProfile(latest.profile);
  }
}
function rewardCode(level) {
  return `SAVE${level === 10 ? "FRASCO" : level === 5 ? "50" : "FRETE"}-${session.slice(-4)}`;
}
function renderRewards() {
  const p = loadProfile(),
    n = p.verified.length,
    customer = customerRecord(),
    rankOverride = Number(customer?.rankOverride || 0),
    basePoints = n * 100,
    levelIndex = rankOverride
      ? Math.max(0, Math.min(LEVELS.length - 1, rankOverride - 1))
      : getLevelIndex(basePoints),
    points = Math.max(basePoints, LEVELS[levelIndex].points),
    level = LEVELS[levelIndex],
    next = LEVELS[levelIndex + 1];
  document.querySelector("#points-total").textContent = points.toLocaleString(
    t[language].locale,
  );
  document.querySelector("#level-name").textContent = level.name[language];
  document.querySelector("#header-level").textContent = level.name[language];
  document.querySelector("#level-number").textContent =
    `${language === "en" ? "Level" : language === "es" ? "Nivel" : "Nível"} ${levelIndex + 1}`;
  document.querySelector("#level-range").textContent = next
    ? `${level.points.toLocaleString(t[language].locale)}–${next.points.toLocaleString(t[language].locale)} pts`
    : `${level.points.toLocaleString(t[language].locale)}+ pts`;
  document.querySelector("#next-level-label").textContent = next
    ? t[language].nextPoints(next.points - points, next.name[language])
    : t[language].maxLevel;
  document.querySelector("#bonus-progress").style.width = next
    ? `${Math.min(100, ((points - level.points) / (next.points - level.points)) * 100)}%`
    : "100%";
  document.querySelector("#progress-message").textContent =
    n >= 10 ? t[language].ready : t[language].remaining(10 - n);
  document.querySelectorAll("[data-reward]").forEach((card) => {
    const threshold = Number(card.dataset.reward),
      button = card.querySelector("button"),
      unlocked = n >= threshold,
      claimed = p.claimed[threshold];
    card.classList.toggle("unlocked", unlocked);
    card.classList.toggle("claimed", !!claimed);
    button.disabled = !unlocked || !!claimed;
    button.textContent = claimed
      ? t[language].activated
      : unlocked
        ? t[language].redeem
        : language === "en"
          ? "Locked"
          : language === "es"
            ? "Bloqueado"
            : "Bloqueado";
  });
  document.querySelector("#level-journey").innerHTML = LEVELS.map(
    (x, i) =>
      `<article class="${i < levelIndex ? "complete" : i === levelIndex ? "current" : ""}"><span>${i < levelIndex ? "✓" : i + 1}</span><div><small>${language === "en" ? "LEVEL" : language === "es" ? "NIVEL" : "NÍVEL"} ${i + 1}</small><strong>${x.name[language]}</strong><p>${x.prize[language]}</p></div><b>${x.points.toLocaleString(t[language].locale)} pts</b></article>`,
  ).join("");
  let migrated = false;
  const claimed = Object.entries(p.claimed).map(([key, value]) => {
    const card = document.querySelector(`[data-reward="${key}"]`),
      item =
        typeof value === "string"
          ? {
              code: value,
              title: card?.querySelector("h3")?.textContent || value,
              activatedAt: new Date().toISOString(),
            }
          : value;
    if (typeof value === "string") {
      p.claimed[key] = item;
      migrated = true;
    }
    return [key, item];
  });
  if (migrated) saveProfile(p);
  document.querySelector("#active-benefits-count").textContent = claimed.length;
  document.querySelector("#header-benefits-count").textContent = claimed.length;
  document.querySelector("#active-benefits").innerHTML = claimed.length
    ? claimed
        .map(
          ([, item]) =>
            `<article><span class="benefit-check">✓</span><div><small>${t[language].activated} · ${new Date(item.activatedAt).toLocaleDateString(t[language].locale)}</small><strong>${escapeHtml(item.title)}</strong><code>${escapeHtml(item.code)}</code></div><button type="button" data-copy-code="${escapeHtml(item.code)}">${t[language].copyCode}</button></article>`,
        )
        .join("")
    : `<div class="wallet-empty">${t[language].walletEmpty}</div>`;
}
document.querySelector(".rewards-grid").addEventListener("click", async (e) => {
  const button = e.target.closest("button"),
    card = button?.closest("[data-reward]");
  if (!card || button.disabled) return;
  const p = loadProfile(),
    level = Number(card.dataset.reward),
    code = rewardCode(level);
  p.claimed[level] = {
    code,
    title: card.querySelector("h3").textContent,
    activatedAt: new Date().toISOString(),
  };
  const out = document.querySelector("#coupon-output");
  out.className = "coupon-output show";
  button.disabled = true;
  try {
    await syncCustomerProfile(p);
    renderRewards();
    if (!loadProfile().claimed[level]) throw new Error("Benefício indisponível para este perfil.");
    out.innerHTML = `<span>${t[language].activated}</span><strong>${escapeHtml(code)}</strong>`;
  } catch (failure) { out.textContent = failure.message; button.disabled = false; }
});
document
  .querySelector("#active-benefits")
  .addEventListener("click", async (e) => {
    const button = e.target.closest("[data-copy-code]");
    if (!button) return;
    try {
      await navigator.clipboard.writeText(button.dataset.copyCode);
      button.textContent = t[language].copied;
    } catch {
      button.textContent = button.dataset.copyCode;
    }
  });
const dialog = document.querySelector("#scanner-dialog"),
  video = document.querySelector("#scanner-video"),
  scannerStatus = document.querySelector("#scanner-status");
let stream, scanTimer, html5Scanner;
function openScanner(mode) {
  scanMode = mode;
  scannerStatus.textContent = "A câmara será solicitada ao iniciar.";
  dialog.showModal();
}
document
  .querySelector("#open-scanner")
  .addEventListener("click", () => openScanner("verify"));
document
  .querySelector("#mobile-scanner")
  .addEventListener("click", () => openScanner("verify"));
document
  .querySelector("#login-scanner")
  .addEventListener("click", () => openScanner("login"));
const supportDialog = document.querySelector("#support-dialog");
document.querySelector("#open-support")?.addEventListener("click", () =>
  supportDialog.showModal(),
);
document.querySelector("#close-support")?.addEventListener("click", () =>
  supportDialog.close(),
);
document.querySelector("#support-open-scanner")?.addEventListener("click", () => {
  supportDialog.close();
  openScanner("verify");
});
supportDialog?.addEventListener("click", (event) => {
  if (event.target === supportDialog) supportDialog.close();
});
async function stopCamera() {
  clearInterval(scanTimer);
  if (html5Scanner) {
    try {
      if (html5Scanner.isScanning) await html5Scanner.stop();
      html5Scanner.clear();
    } catch {}
    html5Scanner = null;
  }
  if (stream) stream.getTracks().forEach((x) => x.stop());
  stream = null;
  video.srcObject = null;
}
document.querySelector("#close-scanner").addEventListener("click", async () => {
  await stopCamera();
  dialog.close();
});
dialog.addEventListener("close", stopCamera);
async function acceptCode(raw, source = "qr-camera") {
  const match = String(raw).toUpperCase().match(SERIAL_PATTERN_LOOSE);
  if (!match) return false;
  await stopCamera();
  dialog.close();
  if (scanMode === "login") {
    loginInput.value = match[0];
    loginCount.textContent = `${match[0].length}`;
    return loginWith(match[0], source);
  }
  input.value = match[0];
  count.textContent = `${match[0].length}`;
  verify(match[0], source);
  return true;
}
document.querySelector("#start-camera").addEventListener("click", async () => {
  try {
    if (window.Html5Qrcode) {
      await stopCamera();
      html5Scanner = new Html5Qrcode("qr-reader");
      scannerStatus.textContent = "Aponte para o QR Code do selo.";
      await html5Scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 }, aspectRatio: 1 },
        (decodedText) => acceptCode(decodedText, "qr-camera"),
        () => {},
      );
      return;
    }
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
    });
    video.srcObject = stream;
    await video.play();
    scannerStatus.textContent = "QR Code…";
    if (!("BarcodeDetector" in window)) {
      scannerStatus.textContent =
        "Leitura automática indisponível neste navegador.";
      return;
    }
    const detector = new BarcodeDetector({ formats: ["qr_code"] });
    scanTimer = setInterval(async () => {
      try {
        const codes = await detector.detect(video);
        if (codes[0]) await acceptCode(codes[0].rawValue);
      } catch {}
    }, 500);
  } catch {
    scannerStatus.textContent = "Não foi possível aceder à câmara.";
  }
});
document.querySelector("#qr-file").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    if (window.Html5Qrcode) {
      await stopCamera();
      html5Scanner = new Html5Qrcode("qr-reader");
      const decodedText = await html5Scanner.scanFile(file, true);
      await acceptCode(decodedText, "qr-image");
      e.target.value = "";
      return;
    }
    if (!("BarcodeDetector" in window)) throw new Error("unsupported");
    const codes = await new BarcodeDetector({ formats: ["qr_code"] }).detect(
      await createImageBitmap(file),
    );
    if (codes[0]) await acceptCode(codes[0].rawValue, "qr-image");
  } catch {
    scannerStatus.textContent = "Não foi possível ler esta imagem.";
  }
});
const helpWrap = document.querySelector(".login-help-wrap"),
  helpButton = document.querySelector("#open-instructions");
function setHelpOpen(open) {
  helpWrap.classList.toggle("open", open);
  helpButton.setAttribute("aria-expanded", String(open));
}
helpButton.addEventListener("click", (e) => {
  e.stopPropagation();
  setHelpOpen(!helpWrap.classList.contains("open"));
});
document.addEventListener("click", (e) => {
  if (!helpWrap.contains(e.target)) setHelpOpen(false);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") setHelpOpen(false);
});
// The old "35172" demo serial only existed under the retired digit-serial
// catalog and has no equivalent here — license codes are minted on demand
// (SHOW ONCE) and can't be baked into a static demo QR, so this decorative
// code was removed rather than left pointing at something invalid.
const serialFromUrl = new URLSearchParams(location.search).get("serial");
async function restoreSession() {
  const storedSession = session;
  session = "";
  if (storedSession) {
    try {
      const data = await requireResponse(await fetch(`/api/profiles?id=${encodeURIComponent(storedSession)}`, { cache: "no-store" }));
      session = storedSession;
      applyRemoteProfile(data.profile);
      await refreshCatalog();
      showApp(session);
    } catch (failure) { lockSession(failure.message); }
  }
  if (serialFromUrl && validSerial(serialFromUrl)) {
    if (!session) {
      loginInput.value = serialFromUrl;
      loginCount.textContent = `${serialFromUrl.length}`;
      await loginWith(serialFromUrl, "qr-link");
    } else {
      input.value = serialFromUrl;
      count.textContent = `${serialFromUrl.length}`;
      await verify(serialFromUrl, "qr-link");
    }
    // Scrub the license code out of the visible URL/history entry the
    // moment it's been consumed — it already reached the server once (how
    // else would this flow work), but there's no reason to leave it
    // sitting in the address bar, browser history, or a bookmark after.
    const cleanUrl = new URL(location.href);
    cleanUrl.searchParams.delete("serial");
    history.replaceState(history.state, "", cleanUrl.pathname + cleanUrl.search + cleanUrl.hash);
  }
}
void restoreSession();
let installPrompt;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  installPrompt = e;
});
document.querySelector("#install-app").addEventListener("click", async () => {
  if (installPrompt) {
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
  }
});
document.querySelector("#share-invite").addEventListener("click", async () => {
  const url = `${location.origin}${location.pathname}`;
  try {
    if (navigator.share) await navigator.share({ title: "Save Concept", url });
    else await navigator.clipboard.writeText(url);
  } catch {}
});
if ("serviceWorker" in navigator)
  window.addEventListener("load", () =>
    navigator.serviceWorker.register("./sw.js").catch(() => {}),
  );

// Assinatura visual: progresso, revelação, ampola 3D e resposta ao clique.
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const scrollSignature = document.querySelector("#scroll-signature i");
const updateScrollSignature = () => {
  const available = document.documentElement.scrollHeight - innerHeight;
  const progress = available > 0 ? Math.min(100, (scrollY / available) * 100) : 0;
  scrollSignature?.style.setProperty("--scroll-progress", `${progress}%`);
};
updateScrollSignature();
addEventListener("scroll", updateScrollSignature, { passive: true });
addEventListener("resize", updateScrollSignature, { passive: true });

const revealTargets = document.querySelectorAll(
  "main > section:not(.hero), .verify-card, .product-copy, .signature-vial",
);
if (!reduceMotion.matches && "IntersectionObserver" in window) {
  revealTargets.forEach((element, index) => {
    element.classList.add("reveal-ready");
    element.style.setProperty("--reveal-delay", `${(index % 3) * 70}ms`);
  });
  const revealObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -5%" },
  );
  revealTargets.forEach((element) => revealObserver.observe(element));
}

const signatureVial = document.querySelector("#signature-vial");
const vialFlipButton = document.querySelector("#vial-flip");
// See the note above the removed #login-demo-qr block — same reasoning.
if (signatureVial && vialFlipButton) {
  const setVialSide = (flipped) => {
    signatureVial.classList.toggle("is-flipped", flipped);
    vialFlipButton.setAttribute("aria-pressed", String(flipped));
  };
  vialFlipButton.addEventListener("click", () => {
    setVialSide(!signatureVial.classList.contains("is-flipped"));
  });
  vialFlipButton.addEventListener("pointerenter", (event) => {
    if (event.pointerType === "mouse") setVialSide(true);
  });
  vialFlipButton.addEventListener("pointerleave", (event) => {
    if (event.pointerType === "mouse") setVialSide(false);
  });
}

document.addEventListener("click", (event) => {
  const trigger = event.target.closest("a[href^='#'], .mobile-nav button, [data-tab]");
  if (!trigger) return;
  document.body.classList.remove("ui-transitioning");
  requestAnimationFrame(() => document.body.classList.add("ui-transitioning"));
  window.setTimeout(() => document.body.classList.remove("ui-transitioning"), 520);
  const targetId = trigger.getAttribute("href")?.slice(1);
  if (!targetId) return;
  const target = document.getElementById(targetId);
  target?.classList.remove("section-arrival");
  requestAnimationFrame(() => target?.classList.add("section-arrival"));
  window.setTimeout(() => target?.classList.remove("section-arrival"), 720);
});

if (matchMedia("(pointer: fine)").matches && !reduceMotion.matches) {
  const dot = document.createElement("span");
  const ring = document.createElement("span");
  dot.className = "brand-cursor-dot";
  ring.className = "brand-cursor-ring";
  document.body.append(dot, ring);
  let pointerX = -50;
  let pointerY = -50;
  let ringX = -50;
  let ringY = -50;
  addEventListener("pointermove", (event) => {
    pointerX = event.clientX;
    pointerY = event.clientY;
    dot.style.left = `${pointerX}px`;
    dot.style.top = `${pointerY}px`;
    document.body.classList.add("brand-cursor-active");
  }, { passive: true });
  const animateCursor = () => {
    ringX += (pointerX - ringX) * 0.18;
    ringY += (pointerY - ringY) * 0.18;
    ring.style.left = `${ringX}px`;
    ring.style.top = `${ringY}px`;
    requestAnimationFrame(animateCursor);
  };
  animateCursor();
  document.addEventListener("pointerover", (event) => {
    document.body.classList.toggle(
      "brand-cursor-hover",
      Boolean(event.target.closest("a, button, input, select, [role='button']")),
    );
  });
  document.addEventListener("pointerdown", (event) => {
    const ripple = document.createElement("span");
    ripple.className = "brand-ripple";
    ripple.style.left = `${event.clientX}px`;
    ripple.style.top = `${event.clientY}px`;
    document.body.append(ripple);
    ripple.addEventListener("animationend", () => ripple.remove(), { once: true });
  });
}

function addDepthResponse(selector) {
  if (reduceMotion.matches || !matchMedia("(pointer: fine)").matches) return;
  document.querySelectorAll(selector).forEach((card) => {
    card.addEventListener("pointermove", (event) => {
      const rect = card.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      card.style.setProperty("--depth-x", `${y * -2.2}deg`);
      card.style.setProperty("--depth-y", `${x * 2.2}deg`);
    });
    card.addEventListener("pointerleave", () => {
      card.style.setProperty("--depth-x", "0deg");
      card.style.setProperty("--depth-y", "0deg");
    });
  });
}
addDepthResponse(".verify-card");

const consentBanner = document.querySelector("#consent-banner");
const consentDialog = document.querySelector("#consent-dialog");
const currentConsent = loadConsent();
if (!currentConsent.decidedAt) consentBanner?.removeAttribute("hidden");
document.querySelector("#consent-essential")?.addEventListener("click", () => saveConsent({}));
document.querySelector("#consent-all")?.addEventListener("click", () => saveConsent({ analytics: true, personalization: true, marketing: true }));
document.querySelector("#consent-settings")?.addEventListener("click", () => {
  const consent = loadConsent();
  document.querySelector("#consent-analytics").checked = Boolean(consent.analytics);
  document.querySelector("#consent-personalization").checked = Boolean(consent.personalization);
  document.querySelector("#consent-marketing").checked = Boolean(consent.marketing);
  consentDialog?.showModal();
});
document.querySelector("#close-consent")?.addEventListener("click", () => consentDialog?.close());
document.querySelector("#save-consent")?.addEventListener("click", () => {
  saveConsent({
    analytics: document.querySelector("#consent-analytics").checked,
    personalization: document.querySelector("#consent-personalization").checked,
    marketing: document.querySelector("#consent-marketing").checked,
  });
  consentDialog?.close();
  if (session) renderRewards();
});
setLanguage(language);
