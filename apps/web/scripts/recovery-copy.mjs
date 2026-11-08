import fs from 'node:fs';import {fileURLToPath} from 'node:url';import ts from 'typescript';import {JSDOM} from 'jsdom';
const web=fileURLToPath(new URL('../',import.meta.url));
export function recoveryMessages(){
 const keys=new Set(),add=text=>{const key=text.replace(/\s+/g,' ').trim();if(key&&key.length<1800&&/[A-Za-z]/.test(key)&&!key.includes('__CONNECTION_REASON__'))keys.add(key)};
 function javascript(source){const ast=ts.createSourceFile('recovery.js',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);function visit(node){if(ts.isBinaryExpression(node)&&node.operatorToken.kind===ts.SyntaxKind.PlusToken){const parts=[];const flatten=value=>{if(ts.isBinaryExpression(value)&&value.operatorToken.kind===ts.SyntaxKind.PlusToken){flatten(value.left);flatten(value.right)}else parts.push(value)};flatten(node);if(parts.some(part=>ts.isStringLiteral(part))){let slot=0;add(parts.map(part=>ts.isStringLiteral(part)?part.text:'{'+slot+++'}').join(''));}}if(ts.isStringLiteral(node)&&/[A-Za-z]{2} [A-Za-z]/.test(node.text)&&!/[<>]|content-type|application\/json/.test(node.text))add(node.text);ts.forEachChild(node,visit)}visit(ast)}
 function html(source){const dom=new JSDOM(source);try{for(const script of dom.window.document.querySelectorAll('script'))javascript(script.textContent);for(const element of dom.window.document.querySelectorAll('script,style,pre,code,svg'))element.remove();const walker=dom.window.document.createTreeWalker(dom.window.document,dom.window.NodeFilter.SHOW_TEXT);while(walker.nextNode())add(walker.currentNode.data);}finally{dom.window.close()}}
 const worker=fs.readFileSync(web+'public/sw.js','utf8').replace(/\/\* START RECOVERY I18N \*\/[\s\S]*?\/\* END RECOVERY I18N \*\//g,'');
 html(worker.match(/const unavailablePage = `([\s\S]*?)`;/)[1]);html(fs.readFileSync(web+'public/connection-check.html','utf8'));javascript(fs.readFileSync(web+'public/connection-check.js','utf8'));
 return [...keys].filter(key=>!key.startsWith('/')).sort();
}
