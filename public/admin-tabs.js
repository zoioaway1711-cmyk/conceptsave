(() => {
 const tabs=[...document.querySelectorAll('.admin-tabs [role="tab"]')];
 function select(tab,focus=false) {
  for(const item of tabs) {
   const active=item===tab;
   item.setAttribute('aria-selected',String(active));item.tabIndex=active?0:-1;
   document.getElementById(item.getAttribute('aria-controls')).hidden=!active;
  }
  if(focus)tab.focus();
 }
 for(const tab of tabs) {
  tab.addEventListener('click',()=>select(tab));
  tab.addEventListener('keydown',event=>{
   const i=tabs.indexOf(tab);
   const target=event.key==='ArrowRight'?tabs[(i+1)%tabs.length]:event.key==='ArrowLeft'?tabs[(i+tabs.length-1)%tabs.length]:event.key==='Home'?tabs[0]:event.key==='End'?tabs[tabs.length-1]:null;
   if(target){event.preventDefault();select(target,true);}
  });
 }
})();
