// Exercise the built dashboard in the same tab across a failed and a repaired release.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {preview} from 'vite';

const root=fileURLToPath(new URL('../',import.meta.url));
const tools=process.env.ICLUSTERS_BROWSER_TOOLS||'/tmp/iclusters-browser-tools/node_modules';
const {chromium}=await import(pathToFileURL(path.join(tools,'playwright-core/index.mjs')));
const executablePath=process.env.CHROMIUM_EXECUTABLE||await (await import(pathToFileURL(path.join(tools,'@sparticuz/chromium/build/index.js')))).default.executablePath();
const browser=await chromium.launch({executablePath,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
let server;
try {
 server=await preview({root,preview:{host:'127.0.0.1',port:0}});
 const origin='http://127.0.0.1:'+server.httpServer.address().port;
 const page=await browser.newPage({viewport:{width:390,height:820},serviceWorkers:'block'});
 const shell=await (await fetch(origin)).text();
 const entryPath=shell.match(/<script\b[^>]*type="module"[^>]*\bsrc="([^"]+)"/)?.[1];
 assert.ok(entryPath,'Production shell must declare its module entry');
 let missing;
 await page.route('**/assets/**',route=>{
  const pathname=new URL(route.request().url()).pathname;
  return missing?.test(pathname)?route.fulfill({status:404,body:''}):route.continue();
 });
 await page.route('**/api/health',route=>route.fulfill({json:{ok:true}}));
 await page.route('**/api/auth/setup',route=>route.fulfill({json:{registrationOpen:false,needsOwner:false}}));
 async function check(expected){
  await page.locator('#check').click();
  await page.locator('#result').filter({hasText:expected}).waitFor({timeout:12000});
 }
 missing={test:pathname=>pathname===entryPath};
 await page.goto(origin);
 await page.getByRole('link',{name:'Retry connection'}).waitFor();
 await page.getByRole('link',{name:'Connection diagnostics'}).click();
 await check('dashboard is unavailable');
 missing=undefined;
 await check('Connected.');
 // The entry can execute even when the lazy dashboard route is missing.
 missing=/\/Dashboard-[^/]+\.js$/;
 await page.reload();
 await check('dashboard is unavailable');
 missing=undefined;
 await page.reload();
 await check('Connected.');
 await page.goto(origin);
 await page.getByRole('button',{name:'Sign in',exact:true}).waitFor();
 // Recreate the external overlay seen on the live dashboard. The helper may
 // attach its container first and replace its contents on a later click.
 const quickSearch=page.locator('body > #dse-quicksearch');
 await page.evaluate(()=>{
  const host=document.createElement('div');
  host.id='dse-quicksearch';
  host.style.cssText='position:fixed;inset:0;display:block;z-index:10000';
  host.textContent='Search results';
  document.body.append(host);
 });
 assert.ok(await quickSearch.isVisible(),'Working Quick Search results remain visible');
 await quickSearch.evaluate(host=>{
  host.innerHTML='<div id="feature"><div id="content"><h1 id="unavailable">Error 403 - Forbidden</h1><p>The web app you have attempted to reach has blocked your access.</p></div></div>';
 });
 assert.ok(await quickSearch.isHidden(),'A failed Quick Search overlay must not cover the application');
 // A real denial still belongs to the operation that returned it.
 await page.route('**/api/auth/login',route=>route.fulfill({status:403,json:{error:'Access denied'}}));
 await page.getByPlaceholder('Enter your username').fill('layout-review');
 await page.locator('input[autocomplete="current-password"]').fill(randomUUID());
 await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await page.getByRole('alert').filter({hasText:'Access denied'}).waitFor();
 await quickSearch.evaluate(host=>{host.textContent='Search results'});
 assert.ok(await quickSearch.isVisible(),'Quick Search recovers without a reload');
 console.log('Dashboard recovery from missing entry and route bundles passed in Chromium.');
}finally{
 await browser.close();
 if(server)await new Promise(resolve=>server.httpServer.close(resolve));
}
