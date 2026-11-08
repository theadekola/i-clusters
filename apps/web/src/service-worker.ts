// Refresh recovery code after upgrades and network changes. Never reload an open form.
export function startWorkerUpdates(){
 const url=new URL(window.location.href);
 if(url.searchParams.get('__iclusters_reconnect')==='1'){
  url.searchParams.delete('__iclusters_reconnect');
  window.history.replaceState(window.history.state,'',url.href);
 }
 if(!('serviceWorker' in navigator)||!window.isSecureContext)return()=>{};
 let stopped=false,busy=false;
 const update=async()=>{
  if(stopped||busy||document.hidden)return;
  busy=true;
  try{
   const registration=await navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'});
   if(!stopped)await registration.update();
  }catch{/* A temporary outage must not change the session or disable the dashboard. */}
  finally{busy=false;}
 };
 const visible=()=>{if(!document.hidden)void update()};
 window.addEventListener('online',update);window.addEventListener('pageshow',visible);
 document.addEventListener('visibilitychange',visible);
 const timer=window.setInterval(visible,60000);
 void update();
 return()=>{stopped=true;window.clearInterval(timer);window.removeEventListener('online',update);window.removeEventListener('pageshow',visible);document.removeEventListener('visibilitychange',visible)};
}
