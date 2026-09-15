let sellerContactPending=false;
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}
let serverProfile = null;
let serverProducts = [];
function safeParse(raw, fallback) {
  try {
    return JSON.parse(raw) ?? fallback;
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
  if(session) api('/api/profiles',{consent,preferredLanguage:language}).catch(() => {});
  return consent;
}
function loadRecords() { return serverProducts; }
let records = loadRecords(),
  language = localStorage.getItem("vf-language") || "pt",
  session = "",
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
      "Valide novos produtos e acumule premiações na sua conta Save Concept.",
    verifyTitle: "Verifique o seu produto",
    verifyHint:
      "Introduza o serial de 5, 6 ou 8 números indicado no selo de segurança.",
    serialLabel: "Número de série",
    serialHelp: "Apenas números: exatamente 5, 6 ou 8 dígitos.",
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
    invalid: "Introduza exatamente 5, 6 ou 8 números.",
    batch: "Lote",
    expiry: "Validade",
    loginError: "Este serial não corresponde a um produto validado.",
    duplicate: "Este serial já foi contabilizado nas suas premiações.",
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
      "Enter the 5-, 6- or 8-digit serial shown on the security seal.",
    serialLabel: "Serial number",
    serialHelp: "Numbers only: exactly 5, 6 or 8 digits.",
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
    invalid: "Enter exactly 5, 6 or 8 digits.",
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
    verifyHint: "Ingresa el serial de 5, 6 u 8 números indicado en el sello.",
    serialLabel: "Número de serie",
    serialHelp: "Solo números: exactamente 5, 6 u 8 dígitos.",
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
    invalid: "Ingresa exactamente 5, 6 u 8 números.",
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
    serial: "Serial do produto",
    help: "Aceita seriais de 5, 6 ou 8 dígitos.",
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
    serial: "Product serial",
    help: "Accepts 5-, 6- or 8-digit serials.",
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
    serial: "Serial del producto",
    help: "Acepta seriales de 5, 6 u 8 dígitos.",
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
  bonusTitle: "Suas premiações",
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
    "Apresente seu código exclusivo ao vendedor responsável.",
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
  supportStep2Copy: "Digite 5, 6 ou 8 números, ou utilize a câmara para ler o QR Code.",
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
  walletIntro: "Present your exclusive code to your seller.",
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
  supportStep2Copy: "Enter 5, 6 or 8 digits, or use the camera to scan the QR Code.",
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
  supportStep2Copy: "Ingresa 5, 6 u 8 números o usa la cámara para leer el QR.",
  supportStep3Title: "Revisa el resultado",
  supportStep3Copy: "Producto, dosis, farmacia, lote y estado deben aparecer en la confirmación.",
  supportScan: "Abrir lector de QR",
});
function clean(v) {
  return v.replace(/\D/g, "").slice(0, 8);
}
function validSerial(v) {
  return /^(?:\d{5}|\d{6}|\d{8})$/.test(v);
}
function customerRecord(id = session) { return serverProfile?.id === id ? serverProfile : null; }
function loadProfile() {
 return { verified: serverProfile?.activeSerials || [], verifiedAt: serverProfile?.verifiedAt || {}, claimed: Object.fromEntries((serverProfile?.benefits || []).map(item => [`${item.rank || 1}-${item.threshold}`,item])) };
}
function saveProfile() { /* The server owns the profile. */ }
function applyRemoteProfile(profile) {
 serverProfile=profile;
 serverProducts=profile?.products || [];
 records=serverProducts;
 if(profile) session=profile.id;
}
async function api(path, body) {
 let response;
 try {
  response=await fetch(path,{method:body ? 'POST':'GET',credentials:'same-origin',headers:body ? {'content-type':'application/json','accept':'application/json'}:{accept:'application/json'},body:body ? JSON.stringify(body):undefined,cache:'no-store'});
 } catch { throw new Error('Não foi possível conectar ao servidor. Verifique a conexão e tente novamente.'); }
 let payload;
 try { payload=await response.json(); }
 catch { throw new Error(response.status>=500 ? 'O serviço de autenticação está indisponível. O administrador deve verificar o banco de dados e a configuração da publicação.' : 'O servidor não retornou uma resposta válida. Verifique se o site foi publicado como Next.js com as rotas /api disponíveis.'); }
 if(!response.ok) throw new Error(response.status===429 ? 'Muitas tentativas. Aguarde antes de tentar novamente.' : response.status===401 ? 'Serial não encontrado ou acesso não autorizado. Confira o serial cadastrado.' : response.status>=500 ? 'Serviço temporariamente indisponível. Tente novamente mais tarde.' : 'Não foi possível concluir. Verifique os dados e tente novamente.');
 return payload;
}
function showApp(serial) {
  session = serial;

  document.querySelector("#login-gate").classList.add("hidden");
  document.querySelector("#user-serial").textContent = serial;
  renderRewards();
  renderHistory();
}
async function loginWith(serial, source = "manual") {
 const button=document.querySelector('#login-form button[type="submit"]');
 if(button.disabled) return false;
 button.disabled=true;
 const error=document.querySelector('#login-error');
 if(!validSerial(serial)){error.textContent='Digite um serial de 5, 6 ou 8 números.';button.disabled=false;return false;}
 error.textContent='A verificar…';
 try {
  const payload=await api('/api/session',{serial,source,metadata:auditMetadata()});
  if(!payload?.profile?.id) throw new Error('Resposta de autenticação incompleta. Tente novamente.');
  applyRemoteProfile(payload.profile); error.textContent=''; showApp(payload.profile.id); return true;
 } catch(e) {error.textContent=e.message || 'Servidor indisponível. Tente novamente.';return false;}
 finally {button.disabled=false;}
}
document.querySelector("#login-form").addEventListener("submit", (e) => {
  e.preventDefault();
  loginWith(clean(loginInput.value), "manual").catch(() => {});
});
loginInput.addEventListener("input", () => {
  loginInput.value = clean(loginInput.value);
  loginCount.textContent = `${loginInput.value.length} / 8`;
  document.querySelector("#login-error").textContent = "";
});
document.querySelector("#logout").addEventListener("click", async () => {
 try { await fetch('/api/session',{method:'DELETE',credentials:'same-origin'}); location.reload(); }
 catch { result.textContent='Não foi possível encerrar a sessão. Tente novamente.'; }
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
        const activation=serverProfile?.products?.find(product=>product.serial===serial);
        return { ...item, timestamp: p.verifiedAt[serial], activationTimezone:activation?.activationTimezone || '',activationCity:activation?.activationCity || '' };
      })
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  document.querySelector("#history-count").textContent = items.length;
  const fmt={day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'};
  document.querySelector('#products-active-total').textContent=items.length;
  const latest=items[0]?.timestamp ? new Date(items[0].timestamp) : null;
  document.querySelector('#products-last-activation').textContent=latest && Number.isFinite(latest.getTime()) ? latest.toLocaleString(t[language].locale,{...fmt,timeZone:items[0].activationTimezone || 'UTC',timeZoneName:'short'}) : '—';
  historyBody.innerHTML=items.length ? items.map(x=>{
   const activated=new Date(x.timestamp),known=Number.isFinite(activated.getTime());
   const zone=x.activationTimezone || 'UTC';
   const until=new Date(activated);
   if(known){const month=until.getUTCMonth();until.setUTCFullYear(until.getUTCFullYear()+2);if(until.getUTCMonth()!==month)until.setUTCDate(0);}
   const elapsed=known ? Math.max(0,Math.min(100,(Date.now()-activated.getTime())/(until.getTime()-activated.getTime())*100)) : 0;
   return `<article class="user-product-card"><div class="user-product-heading"><img class="product-brand-logo" src="./save-concept-mark-v2.webp" alt="Save Concept" width="48" height="48" loading="lazy" decoding="async" /><span class="product-active-badge">Serial ativo</span></div><h3>${escapeHtml(x.name)}</h3><p class="product-maker">${escapeHtml(x.maker || 'Save Concept')}</p><dl><div><dt>Serial do seu produto</dt><dd><code>${escapeHtml(x.serial)}</code></dd></div><div><dt>Ativado em · ${escapeHtml(x.activationTimezone ? (x.activationCity || x.activationTimezone) : 'UTC — localização indisponível')}</dt><dd>${known ? `<time datetime="${escapeHtml(activated.toISOString())}">${escapeHtml(activated.toLocaleString(t[language].locale,{...fmt,timeZone:zone,timeZoneName:'short'}))}</time>` : 'Não informado'}</dd></div><div><dt>Validade cadastrada do lote</dt><dd>${escapeHtml(x.expiry || 'Não informada — confira a embalagem')}</dd></div><div><dt>Lote</dt><dd>${escapeHtml(x.lot || '—')}</dd></div></dl><div class="product-followup"><span>Acompanhamento de 2 anos</span><strong>${known ? until.toLocaleDateString(t[language].locale) : 'Data indisponível'}</strong><div class="product-followup-track"><span style="width:${elapsed}%"></span></div><small>${known && Date.now()>until.getTime() ? 'Período de acompanhamento encerrado' : 'Contado a partir da primeira ativação'}</small></div></article>`;
  }).join('') : `<div class="products-empty">${t[language].empty}</div>`;

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
  document.querySelectorAll(".language-select").forEach(select => { select.value = lang; });
  renderHistory();
  if (session) renderRewards();
}
document
  .querySelectorAll("[data-lang]")
  .forEach((b) =>
    b.addEventListener("click", () => setLanguage(b.dataset.lang)),
  );
document.querySelectorAll(".language-select").forEach(select => {
  select.addEventListener("change", () => setLanguage(select.value));
});
input.addEventListener("input", () => {
  input.value = clean(input.value);
  count.textContent = `${input.value.length} / 8`;
  result.className = "result";
  result.innerHTML = "";
});
document.querySelector("#verify-form").addEventListener("submit", (e) => {
  e.preventDefault();
  verify(clean(input.value), "manual");
});
async function verify(serial, source = "manual") {
 const button=document.querySelector('#verify-form button[type="submit"]');
 if(button.disabled) return;
 button.disabled=true; result.className='result show'; result.textContent='A consultar o servidor…';
 try {
  const payload=await api('/api/verifications',{serial,source,metadata:auditMetadata()});
  if(payload.profile) applyRemoteProfile(payload.profile);
  renderHistory(); renderRewards();
  if(payload.status==='authentic' && payload.product) {
   const item=payload.product;
   result.className='result show authentic';
   result.innerHTML=`<strong>✓ ${t[language].valid}</strong>${escapeHtml(item.name)}<br>${escapeHtml(item.maker)} · ${t[language].batch} ${escapeHtml(item.lot)} · ${t[language].expiry} ${escapeHtml(item.expiry)}<br><small>${payload.credited ? t[language].added : t[language].duplicate}</small>`;
  } else {
   result.className='result show invalid';
   result.textContent=payload.status==='already_claimed' ? 'Este serial já está associado a outro perfil.' : payload.status==='not_found' ? t[language].missing : 'Produto ou perfil bloqueado. Contacte o suporte.';
  }
 } catch(e) {result.className='result show invalid';result.textContent=e.message || 'Servidor indisponível. A consulta não foi confirmada.';}
 finally {button.disabled=false;}
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

const LEVELS = [
  {
    name: { pt: "Bronze", en: "Bronze", es: "Bronce" },
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
function rankInsignia(index) {
  const symbols = [
    '<path d="m12 7 1.4 2.8 3.1.5-2.2 2.2.5 3.1-2.8-1.5-2.8 1.5.5-3.1L7.5 10.3l3.1-.5Z"/><path d="M7 16c1 2 2.5 3 5 4 2.5-1 4-2 5-4M8 18l-2-1m4 3-2-1m8-1 2-1m-4 3 2-1" stroke-width=".8"/>',
    '<path d="m8 14 4-5 4 5M8 18l4-5 4 5"/>',
    '<path d="m12 6 1.8 3.8 4.2.6-3 3 .7 4.2-3.7-2-3.7 2 .7-4.2-3-3 4.2-.6Z"/>',
    '<path d="m6 9 3 3 3-5 3 5 3-3-2 8H8ZM8 20h8"/>',
    '<path d="m6 10 3-4h6l3 4-6 9ZM6 10h12M9 6l3 13 3-13"/>'
  ];
  return `<span class="rank-insignia rank-${index + 1}" aria-hidden="true"><svg viewBox="0 0 24 28" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path class="rank-shield" d="M2 3 12 1l10 2v12c0 5-6 9-10 12C8 24 2 20 2 15Z"/><path d="M4 5 12 3.4 20 5v10c0 3.6-4.6 7.1-8 9.4C8.6 22.1 4 18.6 4 15Z" stroke-width=".6" opacity=".55"/><path d="m5 6 7-1.4L19 6" stroke="#fff" stroke-width="1" opacity=".8"/>${symbols[index]}</svg></span>`;
}
function getLevelIndex(points) {
  let index = 0;
  LEVELS.forEach((entry, i) => {
    if (points >= entry.points) index = i;
  });
  return index;
}
function syncCustomerProfile() { /* Read-only rendering; no client-owned points. */ }
function renderRewards() {
  const p = loadProfile(),
    n = p.verified.length,
    customer = customerRecord(),
    rankOverride = Number(customer?.rankOverride || 0),
    basePoints = Number(serverProfile?.points || 0),
    levelIndex = rankOverride
      ? Math.max(0, Math.min(LEVELS.length - 1, rankOverride - 1))
      : getLevelIndex(basePoints),
    points = basePoints,
    level = LEVELS[levelIndex],
    next = LEVELS[levelIndex + 1];
  document.querySelector("#points-total").textContent = points.toLocaleString(
    t[language].locale,
  );
  document.querySelector("#level-name").textContent = level.name[language];
  document.querySelector("#header-level").textContent = level.name[language];
  document.querySelector('#profile-insignia').innerHTML = rankInsignia(levelIndex);
  document.querySelector('#profile-rank-name').textContent = level.name[language];
  document.querySelector('#profile-points').textContent = points.toLocaleString(t[language].locale);
  document.querySelector('#profile-products').textContent = String(serverProfile?.activeSerials?.length || 0);
  const progress = next ? Math.max(0, Math.min(100, (points-level.points)/(next.points-level.points)*100)) : 100;
  document.querySelector('#profile-progress').value = progress;
  document.querySelector('#profile-next').textContent = next ? t[language].nextPoints(Math.max(0,next.points-points),next.name[language]) : t[language].maxLevel;
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
      button = card.querySelector(".reward-redeem"),
      unlocked = (serverProfile?.rewardCycle?.products || 0) >= threshold,
      claimed = (serverProfile?.benefits || []).find(item=>Number(item.rank)===Number(serverProfile?.level) && Number(item.threshold)===threshold);
    const catalog=serverProfile?.rewardCycle?.catalog?.find(item=>item.threshold===threshold);
    if(catalog){card.querySelector('h3').textContent=catalog.title;card.querySelector('p').textContent=catalog.description;}
    card.querySelector(':scope > span').textContent=`NÍVEL ${serverProfile?.level || 1} · ${threshold} NOVOS PRODUTOS`;
    card.classList.toggle("unlocked", unlocked);
    card.classList.toggle("claimed", !!claimed);
    button.disabled = true;
    button.textContent = claimed?.redeemedAt ? (claimed.title.includes('vitalício') ? 'Vitalício confirmado pelo vendedor' : 'Utilizado · próximo ciclo no novo nível') : claimed ? 'Código disponível abaixo' : `Faltam ${Math.max(0,threshold-(serverProfile?.rewardCycle?.products || 0))} produtos neste nível`;

  });
  document.querySelector("#level-journey").innerHTML = LEVELS.map(
    (x, i) =>
      `<article class="${i < levelIndex ? "complete" : i === levelIndex ? "current" : ""}">${rankInsignia(i)}<div><small>${language === "en" ? "LEVEL" : language === "es" ? "NIVEL" : "NÍVEL"} ${i + 1}</small><strong>${x.name[language]}</strong></div><b>${x.points.toLocaleString(t[language].locale)} pts</b><button type="button" class="bonus-info" data-bonus-info="rank-${i}" aria-label="${language === 'en' ? 'Rank information' : 'Informações do rank'} ${x.name[language]}">i</button></article>`,
  ).join("");
  document.querySelector('#rank-code-wallet').innerHTML=(serverProfile?.rankCodes || []).map(item=>`<article class="rank-code-card"><strong>Rank ${escapeHtml(item.title)}</strong><code>${escapeHtml(item.code)}</code><small>${item.eligible ? 'Código exclusivo · entre em contato com seu vendedor' : 'Elegibilidade suspensa · consulte seu vendedor'}</small></article>`).join('');
  updateSellerContact();
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
  syncCustomerProfile(p, levelIndex, points, claimed);
  document.querySelector("#active-benefits-count").textContent = claimed.filter(([,item])=>item.eligible).length;
  document.querySelector("#header-benefits-count").textContent = claimed.filter(([,item])=>item.eligible).length;
  document.querySelector("#active-benefits").innerHTML = claimed.length
    ? claimed
        .map(
          ([, item]) =>
            `<article><span class="benefit-check">✓</span><div><small>${t[language].activated} · ${new Date(item.activatedAt).toLocaleDateString(t[language].locale)}</small><strong>${escapeHtml(item.title)} · Nível ${Number(item.rank || 1)}</strong><small>${item.redeemedAt ? (item.title.includes('vitalício') ? 'Vitalício confirmado · apresente ao vendedor nos próximos pedidos' : 'Utilizado — confirmado pelo vendedor/admin') : item.eligible===false ? 'Elegibilidade suspensa — consulte o vendedor' : 'Apresente este código ao seu vendedor'}</small><code>${escapeHtml(item.code)}</code></div><button type="button" data-copy-code="${escapeHtml(item.code)}">${t[language].copyCode}</button></article>`,
        )
        .join("")
    : `<div class="wallet-empty">${t[language].walletEmpty}</div>`;
}

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
  const match = String(raw).match(/(?:\d{8}|\d{6}|\d{5})/);
  if (!match) return false;
  await stopCamera();
  dialog.close();
  if (scanMode === "login") {
    loginInput.value = match[0];
    loginCount.textContent = `${match[0].length} / 8`;
    return loginWith(match[0], source);
  }
  input.value = match[0];
  count.textContent = `${match[0].length} / 8`;
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
const demoQr = document.querySelector("#login-demo-qr");
if (window.QRCode && demoQr)
  new QRCode(demoQr, {
    text: `${location.origin}${location.pathname}?serial=35172`,
    width: 120,
    height: 120,
    colorDark: "#071b42",
    colorLight: "#fff",
    correctLevel: QRCode.CorrectLevel.H,
  });
const serialFromUrl = new URLSearchParams(location.search).get("serial");
(async () => {
 try {const payload=await api('/api/session');applyRemoteProfile(payload.profile);showApp(payload.profile.id);} catch {session='';}
 if(serialFromUrl && validSerial(serialFromUrl)) {
  if(!session) {loginInput.value=serialFromUrl;loginCount.textContent=`${serialFromUrl.length} / 8`;await loginWith(serialFromUrl,'qr-link');}
  else {input.value=serialFromUrl;count.textContent=`${serialFromUrl.length} / 8`;await verify(serialFromUrl,'qr-link');}
 }
})();
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
const signatureQr = document.querySelector("#signature-demo-qr");
if (window.QRCode && signatureQr)
  new QRCode(signatureQr, {
    text: `${location.origin}${location.pathname}?serial=35172`,
    width: 150,
    height: 150,
    colorDark: "#071b42",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.H,
  });
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

// Native system cursor: no pointer tracking or continuous cursor animation.

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

const bonusInfoDialog=document.querySelector('#bonus-info-dialog');
document.querySelector('#bonus').addEventListener('click',event=>{
 const trigger=event.target.closest('[data-bonus-info]');if(!trigger)return;
 const key=trigger.dataset.bonusInfo;
 let title='',text='';
 if(key==='club') {
  title=language==='en'?'Your Save Club':'Seu Clube Save';
  text=language==='en'?'Each eligible original product adds 100 points, once per serial. Ranks follow your points; rewards unlock at 3, 5 and 10 validated products. Codes are issued automatically. Contact your seller to request the reward; no redemption takes place on this website.':'Cada produto original elegível soma 100 pontos, uma única vez por serial. Os ranks acompanham seus pontos; os prêmios são renovados a cada nível e liberados com 3, 5 e 10 novas ativações no ciclo. Os códigos são emitidos automaticamente. Apresente-os ao vendedor responsável; o site não realiza o resgate.';
 } else if(key.startsWith('rank-')) {
  const rank=LEVELS[Number(key.slice(5))];title=rank.name[language];
  text=language==='en'?`Rank reached at ${rank.points.toLocaleString()} points. Reward eligibility is shown on each reward card.`:`Rank a partir de ${rank.points.toLocaleString('pt-BR')} pontos. A disponibilidade de cada prêmio aparece no respectivo cartão.`;
 } else {
  const card=document.querySelector(`[data-reward="${key}"]`);title=card.querySelector('h3').textContent;
  text=card.querySelector('p').textContent+(language==='en'?` Unlock with ${key} validated products.`:` Libere com ${key} novas ativações neste nível. O código é emitido automaticamente. Entre em contato com seu vendedor para solicitar o prêmio.`);
 }
 document.querySelector('#bonus-info-title').textContent=title;document.querySelector('#bonus-info-text').textContent=text;bonusInfoDialog.showModal();
});
document.querySelector('#bonus-info-close').addEventListener('click',()=>bonusInfoDialog.close());

const accountMenu=document.querySelector('#account-menu');
document.addEventListener('click',event=>{if(accountMenu && !accountMenu.contains(event.target))accountMenu.open=false;});
document.addEventListener('keydown',event=>{if(event.key==='Escape' && accountMenu?.open){accountMenu.open=false;accountMenu.querySelector('summary').focus();}});


async function updateSellerContact() {
 const link=document.querySelector('#seller-whatsapp');
 if(!serverProfile?.activeSerials?.length || serverProfile.blocked){link.hidden=true;link.removeAttribute('href');return;}
 if(sellerContactPending)return;sellerContactPending=true;
 try {const response=await fetch('/api/seller-contact',{cache:'no-store'});const data=await response.json();link.hidden=!response.ok || !data.url;if(!link.hidden)link.href=data.url;else link.removeAttribute('href');}catch{link.hidden=true;link.removeAttribute('href');}finally{sellerContactPending=false;}
}
