'use strict';
document.getElementById('address').textContent=location.origin;
const result=document.getElementById('result'),check=document.getElementById('check'),reset=document.getElementById('reset');
check.addEventListener('click',async()=>{
 check.disabled=true;result.textContent='Checking this installation…';
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),8000);
 try{
  const response=await fetch('/api/health',{cache:'no-store',credentials:'omit',redirect:'error',signal:controller.signal});
  const data=await response.json().catch(()=>null);
  if(response.ok&&data?.ok===true){
   const shell=await fetch('/',{cache:'no-store',credentials:'omit',redirect:'error',signal:controller.signal});
   const html=await shell.text();
   result.textContent=shell.ok&&/text\/html/i.test(shell.headers.get('content-type')||'')&&html.includes('id="root"')?'Connected. This browser reached the HTTPS dashboard, API and database.':'The API and database are reachable, but the dashboard is unavailable. Check the web container.';
  }else if(response.status===503&&data?.ok===false){result.textContent='HTTPS is reachable, but the application database is unavailable. Check the API and database containers.';}
  else result.textContent='The server returned HTTP '+response.status+'. Check the application or reverse proxy.';
 }catch{result.textContent='The check failed or timed out. This may be a network route, firewall, HTTPS trust or server problem. Open the direct health check for the browser error.';}
 finally{clearTimeout(timeout);check.disabled=false;}
});
reset.addEventListener('click',async()=>{
 reset.disabled=true;
 try{
  if('serviceWorker' in navigator){
   const registration=await navigator.serviceWorker.getRegistration('/');
   if(registration&&registration.scope===location.origin+'/'){
    const removed=await registration.unregister();
    if(!removed)throw Error('Worker could not be removed');
   }
  }
  result.textContent='Browser recovery reset. Close all i-Clusters tabs, then open the dashboard again. Accounts and sign-in data were preserved.';
 }catch{result.textContent='Browser recovery could not be reset. Close the tabs and try again. Server data has not been changed.';}
 finally{reset.disabled=false;}
});
