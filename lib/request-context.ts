import { isIP } from 'node:net';
const clean = (value: string | null, max = 160) => (value || '').trim().slice(0, max);
const decode = (value: string | null) => { try { return decodeURIComponent(value || '').slice(0, 160); } catch { return ''; } };
function coordinate(value: string | null, max: number) { if (!value) return null; const n = Number(value); return Number.isFinite(n) && Math.abs(n) <= max ? n : null; }
export function deviceInfo(ua: string) {
 const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /(?:Chrome|CriOS)\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : ua ? 'Outro' : 'Não disponível';
 const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad|iPod/.test(ua) ? 'iOS / iPadOS' : /Windows/.test(ua) ? 'Windows' : /Macintosh|Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'Não disponível';
 return { browser, os, device: /iPad|Tablet/.test(ua) ? 'Tablet' : /Mobile|iPhone|Android/.test(ua) ? 'Celular' : ua ? 'Computador / outro' : 'Não disponível' };
}
function validTimezone(value:string) {
 try {return value ? new Intl.DateTimeFormat('en',{timeZone:value}).resolvedOptions().timeZone : '';} catch {return '';}
}
export function requestContext(request: Request) {
 const vercel = process.env.VERCEL === '1';
 const h = request.headers;
 const ipValue = vercel ? clean(h.get('x-vercel-forwarded-for') || h.get('x-forwarded-for'), 100).split(',')[0].trim() : '';
 const ip = isIP(ipValue) ? ipValue : '';
 const url = new URL(request.url);
 const userAgent = clean(h.get('user-agent'), 500);
 let referrer = '';
 try { const ref = new URL(h.get('referer') || ''); if (['https:', 'http:'].includes(ref.protocol)) referrer = `${ref.origin}${ref.pathname}`.slice(0, 300); } catch {}
 return {
  timezone:vercel ? validTimezone(clean(h.get('x-vercel-ip-timezone'),100)) : '',
  ip, country: vercel ? clean(h.get('x-vercel-ip-country'), 8) : '', region: vercel ? decode(h.get('x-vercel-ip-country-region')) : '',
  city: vercel ? decode(h.get('x-vercel-ip-city')) : '', latitude: vercel ? coordinate(h.get('x-vercel-ip-latitude'), 90) : null,
  longitude: vercel ? coordinate(h.get('x-vercel-ip-longitude'), 180) : null,
  geoSource: vercel && h.get('x-vercel-ip-country') ? 'vercel-ip' : 'unavailable',
  userAgent, ...deviceInfo(userAgent), requestId: vercel ? clean(h.get('x-vercel-id'), 200) : '',
  host: clean(url.host), requestPath: url.pathname.slice(0, 200), referrer,
 };
}
export function clientMetadata(value: unknown) {
 const input = value && typeof value === 'object' ? value as Record<string, unknown> : {};
 const consent = input.consent && typeof input.consent === 'object' ? input.consent as Record<string, unknown> : {};
 const result: Record<string, unknown> = { consent: { analytics: consent.analytics === true, personalization: consent.personalization === true, marketing: consent.marketing === true }, declaredByBrowser: true };
 if (consent.analytics === true) {
  for (const key of ['timezone','locale','platform','page']) result[key] = String(input[key] || '').split('?')[0].slice(0, 160);
  result.mobile = typeof input.mobile === 'boolean' ? input.mobile : null;
  for (const key of ['screen','viewport']) {
   const dimensions = input[key] as Record<string, unknown> | undefined;
   result[key] = Object.fromEntries(['width','height'].map(k => [k, Number.isFinite(Number(dimensions?.[k])) ? Math.max(0, Math.min(20000, Number(dimensions?.[k]))) : null]));
  }
 }
 return result;
}
