import ts from 'typescript';
const dataFields=new Set(['name','siteName','siteDescription','device','model','id','ip','address','hostname','host','node','nodeName','vmid','volid','image','path','mountpoint','mountPoint','destination','email','username','user','url','endpoint','digest','remoteDigest','fingerprint','serial','version','revision','build','tokenId','mount','dataset','storage','service','command','logs','log','output','stdout','stderr','content','text']);
const uiObjects=new Set(['preset','theme','language','category','option']);
function isData(node){if(ts.isPropertyAccessExpression(node))return dataFields.has(node.name.text)&&!(ts.isIdentifier(node.expression)&&uiObjects.has(node.expression.text));return ts.isElementAccessExpression(node)&&node.argumentExpression&&ts.isStringLiteral(node.argumentExpression)&&dataFields.has(node.argumentExpression.text)}
function output(node,ast){
 if(isData(node))return '__localeRaw('+node.getText(ast)+')';
 if(ts.isBinaryExpression(node)&&[ts.SyntaxKind.BarBarToken,ts.SyntaxKind.QuestionQuestionToken].includes(node.operatorToken.kind)&&isData(node.left))return '__localeDataOr('+node.left.getText(ast)+',()=>'+output(node.right,ast)+','+(node.operatorToken.kind===ts.SyntaxKind.QuestionQuestionToken)+')';
 if(ts.isConditionalExpression(node)){const yes=output(node.whenTrue,ast),no=output(node.whenFalse,ast);if(yes!==node.whenTrue.getText(ast)||no!==node.whenFalse.getText(ast))return '('+node.condition.getText(ast)+'?'+yes+':'+no+')'}
 return node.getText(ast);
}
export function localizeSource(source,id){
 if(!/\.tsx?$/.test(id)||id.includes('/i18n/')||!id.includes('/src/'))return null;
 const ast=ts.createSourceFile(id,source,ts.ScriptTarget.Latest,true,id.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS),changes=[];
 function visit(node){
  if(ts.isJsxAttribute(node)&&node.name.getText(ast)==='name'&&['Area','Line','Bar','Scatter','Radar'].includes(node.parent.parent.tagName?.getText(ast))&&node.initializer){const expression=ts.isJsxExpression(node.initializer)?node.initializer.expression:node.initializer;if(expression)changes.push([node.initializer.getStart(ast),node.initializer.end,'{__localeText('+expression.getText(ast)+')}']);return}
  if((ts.isJsxOpeningElement(node)||ts.isJsxSelfClosingElement(node))&&/^[a-z]/.test(node.tagName.getText(ast))){const raw=node.attributes.properties.filter(a=>ts.isJsxAttribute(a)&&['title','placeholder','aria-label','aria-description','alt'].includes(a.name.getText(ast))&&a.initializer&&ts.isJsxExpression(a.initializer)&&a.initializer.expression&&isData(a.initializer.expression)).map(a=>a.name.getText(ast));if(raw.length)changes.push([node.attributes.end,node.attributes.end,' __localeRawAttrs={'+JSON.stringify(raw)+'}'])}
  if((ts.isFunctionDeclaration(node)||ts.isFunctionExpression(node))&&node.name&&/^[A-Z]/.test(node.name.text)&&node.body)changes.push([node.body.getStart(ast)+1,node.body.getStart(ast)+1,'__localeSubscribe();']);
  if(ts.isArrowFunction(node)&&ts.isVariableDeclaration(node.parent)&&ts.isIdentifier(node.parent.name)&&/^[A-Z]/.test(node.parent.name.text)&&ts.isBlock(node.body))changes.push([node.body.getStart(ast)+1,node.body.getStart(ast)+1,'__localeSubscribe();']);
  if(ts.isCallExpression(node)&&['window.confirm','window.alert','window.prompt','confirm','alert','prompt'].includes(node.expression.getText(ast))&&node.arguments[0]){const arg=node.arguments[0];changes.push([arg.getStart(ast),arg.end,'__localeText('+arg.getText(ast)+')']);return}
  if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&['toLocaleString','toLocaleDateString','toLocaleTimeString'].includes(node.expression.name.text)){
   if(!node.arguments.length)changes.push([node.end-1,node.end-1,'__localeId()']);
   else if(node.arguments[0].getText(ast)==='undefined'||ts.isArrayLiteralExpression(node.arguments[0])&&!node.arguments[0].elements.length)changes.push([node.arguments[0].getStart(ast),node.arguments[0].end,'__localeId()']);
  }
  if(ts.isNewExpression(node)&&node.expression.getText(ast)==='Intl.DateTimeFormat'&&node.arguments?.length===0)changes.push([node.end-1,node.end-1,'__localeId()']);
  if(ts.isJsxExpression(node)&&node.expression&&!ts.isJsxAttribute(node.parent)){
   const guarded=output(node.expression,ast),parent=node.parent,tag=ts.isJsxElement(parent)?parent.openingElement.tagName.getText(ast):'',localizable=/^[a-z]/.test(tag)&&!['pre','code','textarea','kbd','samp','script','style','title'].includes(tag);
   if(guarded!==node.expression.getText(ast)){changes.push([node.expression.getStart(ast),node.expression.end,localizable?'__localeValue('+guarded+')':guarded]);return}
   if(localizable){changes.push([node.expression.end,node.expression.end,')']);changes.push([node.expression.getStart(ast),node.expression.getStart(ast),'__localeValue('])}
  }
  ts.forEachChild(node,visit);
 }
 visit(ast);if(!changes.length)return null;
 for(const [start,end,text] of changes.sort((a,b)=>b[0]-a[0]))source=source.slice(0,start)+text+source.slice(end);
 return {code:"import {raw as __localeRaw,dataOr as __localeDataOr,localizedValue as __localeValue} from '@iclusters/i18n/render';\nimport {getLocale as __localeId,translate as __localeText,useLocale as __localeSubscribe} from '@iclusters/i18n/locale';\n"+source,map:null};
}
