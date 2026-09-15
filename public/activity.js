let customerPage=1,customerPages=1;
let activityPage=1, activityPages=1, activityRecords=[], activitySummary={};
function adminNotice(message) {const node=document.querySelector('#admin-notice');node.textContent=message;node.hidden=!message;}
function activityQuery() {
 const query=new URLSearchParams({page:String(activityPage),customerPage:String(customerPage),customerQ:customerFilter});
 for(const [id,key] of [['verification-search','q'],['activity-action','action'],['activity-status','status'],['activity-from','from'],['activity-to','to']]) {
  const value=document.getElementById(id)?.value;if(value)query.set(key,value);
 }
 return query;
}
function locationLabel(record) {return [record.city,record.region,record.country].filter(Boolean).join(' · ') || 'Localização não disponível';}
function profileAccessSummary(profile) {
 const stats=profile.activityStats || {}, events=profile.events || [], latest=events[0];
 return `<h3>Origem dos acessos</h3><p>${escapeHtml(String(stats.total || events.length))} eventos · ${escapeHtml(String(stats.ips || 0))} IPs · ${escapeHtml(String(stats.countries || 0))} países</p><p>Último acesso: ${latest ? escapeHtml(locationLabel(latest)) : 'Sem registros'}</p><small>Histórico abaixo: até 100 eventos recentes. Use o filtro de perfil na tabela de ativações para consultar outros períodos. IPs diferentes podem indicar redes móveis ou VPN; não comprovam fraude.</small>`;
}
function renderActivity(payload) {
 if(payload?.customersPagination){customerPages=payload.customersPagination.pages;document.querySelector('#customer-page').textContent=`Página ${customerPage} de ${customerPages} · ${payload.customersPagination.total} perfis`;document.querySelector('#customer-prev').disabled=customerPage<=1;document.querySelector('#customer-next').disabled=customerPage>=customerPages;}
 if(payload){activityRecords=payload.records || [];activitySummary=payload.summary || {};activityPages=payload.pagination?.pages || 1;}
 document.querySelector('#verification-total').textContent=activitySummary.total || 0;
 document.querySelector('#verification-valid').textContent=activitySummary.activations || 0;
 document.querySelector('#verification-ips').textContent=activitySummary.ips || 0;
 document.querySelector('#activity-page').textContent=`Página ${activityPage} de ${activityPages} · ${activitySummary.total || 0} registros`;
 document.querySelector('#activity-prev').disabled=activityPage<=1;
 document.querySelector('#activity-next').disabled=activityPage>=activityPages;
 document.querySelector('#verification-log-body').innerHTML=activityRecords.length ? activityRecords.map(entry=>`<tr><td><time>${escapeHtml(new Date(entry.activatedAt).toLocaleString('pt-BR'))}</time></td><td>${escapeHtml(entry.profileId)}</td><td><strong>${escapeHtml(entry.serial || '—')}</strong><small class="customer-date">${escapeHtml(entry.product)}</small></td><td><span class="status-pill ${entry.status==='authentic' || entry.status==='success' ? 'authentic':'invalid'}">${escapeHtml(entry.status)}</span><small class="customer-date">${entry.credited ? 'Primeira ativação' : entry.status==='authentic' ? 'Consulta repetida' : ''}</small></td><td><code>${escapeHtml(entry.ip || 'Não disponível')}</code><small class="customer-date">${escapeHtml(locationLabel(entry))}</small></td><td>${escapeHtml(entry.browser)} · ${escapeHtml(entry.os)}<small class="customer-date">${escapeHtml(entry.device)} · ${escapeHtml(entry.source)} · ${escapeHtml(entry.action)}</small><button class="activity-detail-button" type="button" data-activity-id="${escapeHtml(entry.id)}">Ver acesso</button></td></tr>`).join('') : '<tr><td colspan="6">Nenhum registro corresponde aos filtros.</td></tr>';
}
function activityDetails(record) {
 const details=[['Evento',record.id],['Perfil',record.profileId],['Referência da sessão (não é identidade)',record.metadata?.sessionReference],['Detalhes confirmados pelo servidor',record.metadata?.serverDetails ? JSON.stringify(record.metadata.serverDetails) : '—'],['Serial',record.serial],['Data/hora UTC',record.activatedAt],['Horário na localização do IP',new Date(record.activatedAt).toLocaleString('pt-BR',{timeZone:record.metadata?.activationTimezone || 'UTC',timeZoneName:'short'})],['Fuso registrado na ativação',record.metadata?.activationTimezone || 'Indisponível — exibido em UTC'],['Ação',record.action],['Resultado',record.status],['Ativação inédita',record.credited?'Sim':'Não'],['IP público',record.ip || 'Não disponível em execução local'],['Localização aproximada',locationLabel(record)],['Fonte da localização',record.geoSource==='vercel-ip'?'Geolocalização por IP da Vercel':'Não disponível'],['Latitude aproximada',record.latitude],['Longitude aproximada',record.longitude],['Navegador',record.browser],['Sistema operacional',record.os],['Tipo de dispositivo',record.device],['User-Agent',record.userAgent],['Domínio acessado',record.host],['Endpoint',record.requestPath],['Origem de navegação (sem parâmetros)',record.referrer],['Método de entrada',record.source],['Identificador da requisição',record.requestId],['Fuso declarado pelo navegador',record.metadata?.timezone],['Idioma declarado',record.metadata?.locale],['Página declarada',record.metadata?.page],['Dados opcionais autorizados',record.metadata?.consent?.analytics?'Sim':'Não']];
 document.querySelector('#activity-detail-content').innerHTML=`<dl class="activity-detail-grid">${details.map(([label,value])=>`<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(String(value === '' || value == null ? 'Não disponível' : value))}</dd></div>`).join('')}</dl><p class="privacy-boundary">A localização por IP é uma estimativa de cidade/região; não é endereço residencial nem GPS. VPNs e redes móveis podem alterar o local aparente. Navegador e dispositivo são inferidos do User-Agent e podem ser alterados pelo cliente.</p>`;
 const dialog=document.querySelector('#activity-detail-dialog'); if(!dialog.open)dialog.showModal();
}
document.addEventListener('click',event=>{
 const button=event.target.closest('[data-activity-id]');if(!button)return;
 const rows=[...activityRecords,...remoteCustomerProfiles.flatMap(p=>p.events || [])];
 const record=rows.find(r=>String(r.id)===button.dataset.activityId);if(record)activityDetails(record);
});
document.querySelector('#activity-close').addEventListener('click',()=>document.querySelector('#activity-detail-dialog').close());
let searchTimer;
for(const id of ['verification-search','activity-action','activity-status','activity-from','activity-to']) document.getElementById(id).addEventListener(id==='verification-search'?'input':'change',()=>{
 clearTimeout(searchTimer);searchTimer=setTimeout(()=>{activityPage=1;loadRemoteVerifications().catch(e=>adminNotice(e.message));},300);
});
for(const [id,delta] of [['activity-prev',-1],['activity-next',1]]) document.getElementById(id).addEventListener('click',()=>{activityPage=Math.max(1,Math.min(activityPages,activityPage+delta));loadRemoteVerifications().catch(e=>adminNotice(e.message));});
document.querySelector('#refresh-verifications').addEventListener('click',async event=>{
 event.currentTarget.disabled=true;adminNotice('');
 try {await loadRemoteVerifications();}catch(error){adminNotice(error.message);}finally{document.querySelector('#refresh-verifications').disabled=false;}
});
document.querySelector('#activity-export').addEventListener('click',()=>{
 const keys=['id','activatedAt','profileId','serial','action','status','credited','ip','city','region','country','browser','os','device','source','host','requestId'];
 const cell=value=>`"${String(value ?? '').replace(/^[\s]*[=+@\-\t\r]/,"'$&").replaceAll('"','""')}"`;
 const csv=[keys.map(cell).join(','),...activityRecords.map(r=>keys.map(k=>cell(r[k])).join(','))].join('\r\n');
 const url=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));
 const link=document.createElement('a');link.href=url;link.download=`acessos-pagina-${activityPage}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});

window.activityQuery=activityQuery; window.profileAccessSummary=profileAccessSummary; window.renderActivity=renderActivity;

for(const [id,delta] of [['customer-prev',-1],['customer-next',1]]) document.getElementById(id).addEventListener('click',()=>{customerPage=Math.max(1,Math.min(customerPages,customerPage+delta));loadRemoteVerifications().catch(e=>adminNotice(e.message));});

let auditPage=1,auditPages=1,monitorBusy=false;
async function loadAudit() {
 const query=new URLSearchParams({page:String(auditPage),q:document.querySelector('#audit-search').value});
 const response=await fetch(`/api/admin/audit?${query}`,{cache:'no-store'});
 if(!response.ok) throw new Error('Não foi possível carregar a auditoria. Verifique sua sessão.');
 const data=await response.json();auditPages=data.pages;
 document.querySelector('#audit-page').textContent=`Página ${data.page} de ${data.pages} · ${data.total} registros`;
 document.querySelector('#audit-prev').disabled=auditPage<=1;document.querySelector('#audit-next').disabled=auditPage>=auditPages;
 document.querySelector('#audit-body').innerHTML=data.records.length ? data.records.map(r=>`<tr><td>${escapeHtml(new Date(r.created_at).toLocaleString('pt-BR'))}</td><td>${escapeHtml(r.action)}</td><td>${escapeHtml(r.target_type)} · ${escapeHtml(r.target_id)}</td><td><details><summary>Ver alterações</summary><pre class="audit-json">${escapeHtml(JSON.stringify(r.details,null,2))}</pre><small>IP: ${escapeHtml(r.ip || 'Não disponível')}</small></details></td></tr>`).join('') : '<tr><td colspan="4">Nenhuma alteração registrada para este filtro.</td></tr>';
}
async function refreshMonitor() {
 if(monitorBusy || document.hidden || document.body.classList.contains('admin-locked')) return;
 monitorBusy=true;
 try {await Promise.all([loadRemoteVerifications(),loadAudit()]);document.querySelector('#monitor-status').textContent=`Atualizado às ${new Date().toLocaleTimeString('pt-BR')} · atualização a cada 30 segundos`;}catch(error){document.querySelector('#monitor-status').textContent=error.message;}finally{monitorBusy=false;}
}
document.querySelector('#audit-refresh').addEventListener('click',()=>loadAudit().catch(e=>adminNotice(e.message)));
let auditTimer;
document.querySelector('#audit-search').addEventListener('input',()=>{clearTimeout(auditTimer);auditTimer=setTimeout(()=>{auditPage=1;loadAudit().catch(e=>adminNotice(e.message));},300);});
for(const [id,delta] of [['audit-prev',-1],['audit-next',1]]) document.getElementById(id).addEventListener('click',()=>{auditPage=Math.max(1,Math.min(auditPages,auditPage+delta));loadAudit().catch(e=>adminNotice(e.message));});
new MutationObserver(()=>{if(!document.body.classList.contains('admin-locked')) refreshMonitor();}).observe(document.body,{attributes:true,attributeFilter:['class']});
setInterval(refreshMonitor,30000);
document.addEventListener('visibilitychange',refreshMonitor);
