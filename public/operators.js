const operatorForm=document.querySelector('#operator-create');
const operatorMessage=document.querySelector('#operator-message');
async function operatorRequest(method='GET',body){
 const response=await fetch('/api/admin/operators',{method,credentials:'same-origin',cache:'no-store',headers:body?{'content-type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
 let data;try{data=await response.json();}catch{throw Error('O serviço de operadores está indisponível. Tente novamente.');}
 if(!response.ok)throw Error(response.status===403?'Sessão administrativa encerrada. Entre novamente.':response.status===409?'Esse usuário já existe.':response.status===404?'Operador não encontrado. Atualize a lista.':response.status===400?'Use um usuário de 3 a 60 caracteres (letras, números, ponto, traço ou sublinhado) e senha de 12 a 128 caracteres.':'Não foi possível concluir a operação. Tente novamente.');
 return data;
}
async function refreshOperators(){
 const {operators}=await operatorRequest();const list=document.querySelector('#operator-list');list.replaceChildren();
 for(const op of operators){
  const row=document.createElement('div');row.className='operator-row';
  const label=document.createElement('span');label.textContent=`${op.username} · ${op.active?'Ativo':'Desativado'} · Apenas criar produtos`;
  const actions=document.createElement('div');actions.className='operator-actions';
  for(const remove of [false,true]){
   const button=document.createElement('button');button.type='button';button.textContent=remove?'Remover':op.active?'Desativar':'Ativar';
   button.onclick=async()=>{
    if(remove&&!confirm(`Remover o operador ${op.username}? O acesso será encerrado. Os produtos e a auditoria serão preservados.`))return;
    button.disabled=true;
    try{await operatorRequest(remove?'DELETE':'PATCH',remove?{id:op.id}:{id:op.id,active:!op.active});await refreshOperators();operatorMessage.textContent=remove?'Operador removido.':'Acesso atualizado.';}
    catch(e){operatorMessage.textContent=e.message;button.disabled=false;}
   };actions.append(button);
  }row.append(label,actions);list.append(row);
 }
 if(!operators.length)list.textContent='Nenhum operador cadastrado.';
}
function loadOperatorList(){refreshOperators().catch(e=>{operatorMessage.textContent=e.message;});}
document.querySelector('#refresh-operators').onclick=loadOperatorList;
document.addEventListener('admin-authenticated',loadOperatorList);
fetch('/api/admin/session',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(data=>{if(data?.role==='admin')loadOperatorList();}).catch(()=>{});
operatorForm.onsubmit=async event=>{
 event.preventDefault();const button=operatorForm.querySelector('button[type=submit]');
 const username=operatorForm.elements.username.value.trim().toLowerCase(),password=operatorForm.elements.password.value;
 operatorForm.elements.username.value=username;
 if(!/^[a-z0-9._-]{3,60}$/.test(username)){operatorMessage.textContent='Usuário: use de 3 a 60 caracteres, com letras, números, ponto, traço ou sublinhado.';operatorForm.elements.username.focus();return;}
 if(password.length<12||password.length>128){operatorMessage.textContent='A senha precisa ter de 12 a 128 caracteres.';operatorForm.elements.password.focus();return;}
 button.disabled=true;operatorMessage.textContent='Criando operador…';
 try{await operatorRequest('POST',{username,password});operatorForm.reset();await refreshOperators();operatorMessage.textContent='Operador criado e listado. Acesso somente para cadastrar novos produtos.';}
 catch(e){operatorMessage.textContent=e.message;}finally{button.disabled=false;}
};
