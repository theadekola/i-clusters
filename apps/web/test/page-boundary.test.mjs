import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {JSDOM} from 'jsdom';
test('failed page renders explicit recovery without clearing sessions or replaying an operation',async()=>{
 const directory=fs.mkdtempSync(new URL('../node_modules/page-boundary-',import.meta.url));
 const built=await build({entryPoints:[new URL('../src/components/PageBoundary.tsx',import.meta.url).pathname],bundle:true,format:'esm',platform:'node',packages:'external',jsx:'automatic',write:false});
 const file=directory+'/boundary.mjs';fs.writeFileSync(file,built.outputFiles[0].text);const {default:Boundary}=await import(pathToFileURL(file));
 const dom=new JSDOM('<div id="root"></div>',{url:'https://controller.test'}),previous={window:globalThis.window,document:globalThis.document,act:globalThis.IS_REACT_ACT_ENVIRONMENT},log=console.error;
 globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;console.error=()=>{};
 dom.window.localStorage.setItem('session-fixture','preserve');
 const root=createRoot(document.getElementById('root'));
 function Broken(){throw Error('Failed to fetch dynamically imported module')}
 try{
  await act(async()=>root.render(React.createElement(Boundary,null,React.createElement(Broken))));
  assert.match(document.querySelector('[role=alert]').textContent,/This page could not load/);
  assert.match(document.body.textContent,/not automatically retried/);assert.equal(document.querySelector('button').textContent,'Reload page');
  assert.equal(document.querySelector('a').getAttribute('href'),'/connection-check.html');assert.equal(dom.window.localStorage.getItem('session-fixture'),'preserve');
 }finally{await act(async()=>root.unmount());console.error=log;globalThis.window=previous.window;globalThis.document=previous.document;globalThis.IS_REACT_ACT_ENVIRONMENT=previous.act;dom.window.close();fs.rmSync(directory,{recursive:true,force:true});}
});
