import {Children,cloneElement,createContext,isValidElement,useContext,useId,useState,type ButtonHTMLAttributes,type ComponentProps,type ReactNode} from 'react';

const RowSelection=createContext<{selected:string|null;select:(id:string)=>void}|null>(null);

// One selection per table body, independent of any inspection dialog or other table.
export function SelectionBody({children,...props}:ComponentProps<'tbody'>){
 const [selected,select]=useState<string|null>(null);
 return <RowSelection.Provider value={{selected,select}}><tbody {...props}>{children}</tbody></RowSelection.Provider>;
}

function hasAction(value:ReactNode):boolean {
 return Children.toArray(value).some(child=>isValidElement<any>(child)&&(
  child.type==='button'||child.type==='a'||typeof (child as any).props.onClick==='function'||hasAction((child as any).props.children)
 ));
}
const identityClasses=/\b(resource-name-action|history-alert-name|history-message|retention-name|schedule-name|restore-row-name|rule-name)\b/;
// Row names are ordinary selectable content, rather than a second action button.
function rowContent(value:ReactNode,firstCell=false):ReactNode {
 return Children.map(value,child=>{
  if(!isValidElement<any>(child))return child;
  const props=(child as any).props;
  if(child.type==='button'&&!props.role&&(firstCell||identityClasses.test(props.className||''))){
   return <span className={`row-content-name ${(props.className||'').replace(/\b(resource-name-action|resource-identity-action)\b/g,'')}`} title={props.title}>{rowContent(props.children)}</span>;
  }
  return props.children?cloneElement(child,{},rowContent(props.children,firstCell)):child;
 });
}

export function InspectableRow({onInspect,className='',children,...props}:Omit<ComponentProps<'tr'>,'onClick'|'onKeyDown'> & {onInspect:(row:HTMLTableRowElement)=>void}){
 const id=useId(),selection=useContext(RowSelection),[localSelected,setLocalSelected]=useState(false);
 const cells=Children.toArray(children).filter(child=>isValidElement<any>(child)&&child.type==='td');
 const hasActions=cells.length>1&&hasAction((cells.at(-1) as any)?.props.children);
 const selected=selection?.selected!=null?selection.selected===id:localSelected||/(?:^|\s)(?:[\w-]*-)?selected(?:\s|$)/.test(className);
 const classes=selection?.selected!=null?className.split(/\s+/).filter(c=>!/(?:^|-)selected$/.test(c)).join(' '):className;
 const choose=()=>{if(selection)selection.select(id);else setLocalSelected(true)};
 const activate=(row:HTMLTableRowElement)=>{choose();if(!hasActions)onInspect(row)};
 let first=true;
 const content=Children.map(children,child=>{
  if(!isValidElement<any>(child)||child.type!=='td')return child;
  const isFirst=first;first=false;
  return cloneElement(child,{},rowContent((child as any).props.children,isFirst));
 });
 return <tr {...props} tabIndex={props.tabIndex??0} aria-selected={selected} data-row-action={hasActions?'select':'inspect'} className={`inspectable-row ${classes}${selected?' selected':''}`}
  onClickCapture={event=>{if((event.target as Element).closest('button,a[href]'))choose()}}
  onClick={event=>{const target=event.target as Element;if(target.closest('button,a,input,select,textarea,label,details,summary,[role="button"],[role="switch"],[role="checkbox"],[contenteditable="true"]'))return;activate(event.currentTarget)}}
  onKeyDown={event=>{if(event.target!==event.currentTarget||!['Enter',' '].includes(event.key))return;event.preventDefault();activate(event.currentTarget)}}>{content}</tr>;
}

export function TableAction({label,children,className='',...props}:ButtonHTMLAttributes<HTMLButtonElement> & {label:string;children:ReactNode}){
 return <button {...props} type={props.type||'button'} className={`btn secondary table-action ${className}`} aria-label={label} title={props.title||label}>{children}</button>;
}
