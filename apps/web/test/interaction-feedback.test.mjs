import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import postcss from 'postcss';
import {JSDOM} from 'jsdom';
const css=postcss.parse(fs.readFileSync(new URL('../src/interaction-feedback.css',import.meta.url),'utf8'));
const dom=new JSDOM(`<html data-preset="ocean" data-theme="dark"><body>
 <button id="button">Action</button><a id="link" href="/">Navigate</a><button id="primary" class="primary">Save</button><button id="danger" class="danger">Delete</button>
 <div id="tab" role="tab" tabindex="0">Tab</div><div id="switch" role="switch" tabindex="0">Switch</div><details><summary id="summary">Details</summary></details>
 <select id="select"><option>Host</option></select><input id="checkbox" type="checkbox"><input id="radio" type="radio"><input id="submit" type="submit">
 <table><tbody><tr id="row" class="inspectable-row" tabindex="0"><td>Inspect</td></tr></tbody></table>
 <input id="field" type="text"><textarea id="text"></textarea><div id="card" class="card">Reading</div><a id="anchor">Not a link</a>
 <button id="disabled" disabled>Disabled</button><fieldset disabled><button id="fieldset">Disabled</button><input id="fieldset-input" type="checkbox"></fieldset>
 <a id="aria" href="/" aria-disabled="true">Disabled</a><div aria-disabled="true"><button id="aria-child">Disabled</button></div>
 <div inert><button id="inert-child">Disabled</button></div><button id="inert" inert>Disabled</button>
 </body></html>`);
function feedback(id,state){
 const declarations={};css.walkRules(rule=>{
  if(!rule.selector.includes(':'+state))return;
  const selector=rule.selector.replaceAll(':'+state,'');
  if(dom.window.document.getElementById(id).matches(selector))rule.walkDecls(decl=>declarations[decl.prop]=decl.value);
 });return declarations;
}
test('navigation, action controls, native selectors and inspectable rows have hover and pressed feedback',()=>{
 for(const id of ['button','link','tab','switch','summary','select','checkbox','radio','submit','row']){
  assert.ok(feedback(id,'hover')['border-color'],id+' hover');assert.ok(feedback(id,'active')['box-shadow'],id+' press');
 }
 for(const id of ['field','text'])assert.ok(feedback(id,'hover')['border-color']);
 assert.deepEqual(feedback('card','hover'),{});assert.deepEqual(feedback('card','active'),{});assert.deepEqual(feedback('anchor','hover'),{});assert.deepEqual(feedback('anchor','active'),{});
});
test('disabled controls and inert or disabled ancestors receive no interaction effects',()=>{
 for(const id of ['disabled','fieldset','fieldset-input','aria','aria-child','inert','inert-child']){
  for(const state of ['hover','active','focus-visible'])assert.deepEqual(feedback(id,state),{},id+' '+state);
 }
});
test('primary and destructive actions retain semantic colours while receiving feedback',()=>{
 for(const id of ['primary','danger'])for(const state of ['hover','active']){const d=feedback(id,state);assert.ok(d.filter);assert.equal(d.background,undefined);assert.equal(d.color,undefined);}
});
test('touch presses work outside hover media queries and reduced-motion users retain colour feedback',()=>{
 let active=0,reduced=0;css.walkRules(rule=>{
  if(rule.selector.includes(':active')){assert.equal(rule.parent.type,'root');active++;}
  if(rule.parent.type==='atrule'&&rule.parent.params==='(prefers-reduced-motion:reduce)'){rule.walkDecls('transition',decl=>{assert.equal(decl.value,'none');assert.equal(decl.important,true);reduced++;});}
 });assert.ok(active);assert.ok(reduced);
 for(const theme of ['light','dark']){dom.window.document.documentElement.dataset.theme=theme;assert.match(feedback('button','hover').background,/var\(--theme-highlight/);assert.match(feedback('button','active').background,/var\(--app-accent/);}
});

test('shared feedback works without a selected appearance preset',()=>{
 const root=dom.window.document.documentElement,preset=root.getAttribute('data-preset');root.removeAttribute('data-preset');
 try{for(const id of ['button','link','tab','select']){assert.ok(feedback(id,'hover')['border-color']);assert.ok(feedback(id,'active')['box-shadow']);}}finally{root.setAttribute('data-preset',preset)}
});
