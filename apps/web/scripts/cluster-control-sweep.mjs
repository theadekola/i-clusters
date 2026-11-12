// Walk the enabled buttons observed by the reporting audit. Replay each
// cluster's own recorded API responses in a fresh context; never dispatch a
// control's write to a controller, provider, remote console or external site.
import assert from 'node:assert/strict';

export function observedButtons(container){
 const labels=new Map();
 return Array.from(container.querySelectorAll('button')).filter(el=>el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden').map(el=>{
  const label=(el.getAttribute('aria-label')||el.title||el.innerText||el.textContent||'').trim().replace(/\s+/g,' ');
  const index=labels.get(label)||0;
  labels.set(label,index+1);
  el.dataset.auditControl=String(Array.from(container.querySelectorAll('button')).indexOf(el));
  return {label,index,disabled:el.disabled||!!el.closest('[inert]'),selector:'button[data-audit-control="'+el.dataset.auditControl+'"]'};
 });
}
export function recordedKey(request){
 const url=new URL(request.url());
 url.searchParams.delete('refresh');url.searchParams.sort();
 return [request.method(),url.pathname,url.search,request.headers()['x-iclusters-docker-host']||''].join(' ');
}
export async function sweepClusterButtons({context,origin,snapshots,views,profile}){
 const totals={views:views.length,clicked:0,disabled:0,dialogs:0,downloads:0,nativePrompts:0,unavailable:[],blockedWrites:new Set(),unrecordedReads:new Set()};
 const failures=[],queue=[...views],coverage=[];
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(url.origin!==origin)return route.abort();
  if(!url.pathname.startsWith('/api/'))return route.continue();
  const frame=new URL(req.frame().url()).pathname;
  const prefix='/api/cluster-profiles/'+profile+'/api/';
  const secondary=frame.startsWith('/clusters/'+profile+'/');
  const scoped=url.pathname.startsWith(prefix);
  const local=url.pathname.slice(scoped?prefix.length:5);
  const shared=/^(auth|account|users|product|updates|cluster-profiles|health)(\/|$)/.test(local);
  if(scoped!==(secondary&&!shared))failures.push({frame,url:url.pathname});
  if(req.method()!=='GET'){
   if(local==='product/visit')return route.fulfill({status:204});
   totals.blockedWrites.add(req.method()+' /'+local);
   return route.fulfill({status:409,json:{error:'Disposable audit: action intercepted.'}});
  }
  const saved=snapshots.get(recordedKey(req));
  if(saved)return route.fulfill(saved);
  totals.unrecordedReads.add(local);
  return route.fulfill({status:503,json:{error:'This provider response was not recorded in the fixture.'}});
 });
 async function worker(){
  const page=await context.newPage();
  page.setDefaultTimeout(2000);
  page.on('dialog',dialog=>{totals.nativePrompts++;void dialog.dismiss()});
  page.on('download',()=>{totals.downloads++});
  page.on('popup',popup=>{void popup.close()});
  page.on('pageerror',e=>failures.push({page:page.url(),error:e.message}));
  try{
   for(let view;(view=queue.shift());){
    console.log('Control sweep',view.key,view.buttons.length);
    const entry={view:view.key,observed:view.buttons.length,disabled:view.buttons.filter(b=>b.disabled).length,clicked:0};
    coverage.push(entry);totals.disabled+=entry.disabled;
    for(const target of view.buttons.filter(b=>!b.disabled)){
     // Reset local component state for each control, including drawers,
     // searches, selected resources and confirmation dialogs.
     await page.goto(view.url,{waitUntil:'domcontentloaded'});
     const main=page.locator('main.content');
     await main.waitFor({timeout:12000}).catch(async error=>{throw Error(view.key+' failed to reload at '+page.url()+': '+(await page.locator('body').innerText()).slice(0,300)+' '+error.name)});
     const region=view.detail?main.locator(view.detail.region):main;
     if(view.detail)await region.locator(view.detail.bar).getByRole('button',{name:view.detail.label,exact:true}).click({timeout:5000});
     let match;
     for(let attempt=0;attempt<12;attempt++){
      match=(await region.evaluate(observedButtons)).find(b=>b.label===target.label&&b.index===target.index&&!b.disabled);
      if(match)break;
      await page.waitForTimeout(50);
     }
     if(!match){totals.unavailable.push({view:view.key,label:target.label,reason:'state-dependent control'});continue}
     try{
      await region.locator(match.selector).click({timeout:1600});
      totals.clicked++;entry.clicked++;
      if(await page.getByRole('dialog').count())totals.dialogs++;
     }catch(e){
      totals.unavailable.push({view:view.key,label:target.label,reason:e.name});
     }
    }
   }
  }finally{await page.close()}
 }
 await Promise.all([worker(),worker(),worker()]);
 assert.deepEqual(failures,[]);
 return {...totals,coverage,blockedWrites:[...totals.blockedWrites],unrecordedReads:[...totals.unrecordedReads]};
}
