import {Children,cloneElement,isValidElement,type ButtonHTMLAttributes,type ComponentProps,type ReactNode} from 'react';

// Resource content opens inspection; embedded controls retain their own actions.
function hasControl(value:ReactNode):boolean {
 return Children.toArray(value).some(child=>isValidElement<any>(child)&&(['button','a','input','select','textarea','summary'].includes(String(child.type))||typeof (child as any).props.onClick==='function'||hasControl((child as any).props.children)));
}
export function InspectableRow({onInspect,className='',children,...props}:Omit<ComponentProps<'tr'>,'onClick'|'onKeyDown'> & {onInspect:(row:HTMLTableRowElement)=>void}){
 let first=true;
 const cells=Children.map(children,child=>{
  if(!first||!isValidElement<any>(child)||child.type!=='td')return child;
  first=false;if(hasControl((child as any).props.children))return child;
  return cloneElement(child,{},<button type="button" className="resource-name-action resource-identity-action" aria-label={`Open details: ${props['aria-label']||'resource'}`} onClick={event=>{event.stopPropagation();const row=event.currentTarget.closest('tr');if(row)onInspect(row)}}>{(child as any).props.children}</button>);
 });
 return <tr {...props} tabIndex={props.tabIndex??0} className={`inspectable-row ${className}`} onClick={event=>{const target=event.target as Element;if(target.closest('button,a,input,select,textarea,label,details,summary,[role="button"],[role="switch"],[role="checkbox"],[contenteditable="true"]'))return;onInspect(event.currentTarget)}} onKeyDown={event=>{if(event.target!==event.currentTarget||!['Enter',' '].includes(event.key))return;event.preventDefault();onInspect(event.currentTarget)}}>{cells}</tr>;
}

export function TableAction({label,children,className='',...props}:ButtonHTMLAttributes<HTMLButtonElement> & {label:string;children:ReactNode}){
 return <button {...props} type={props.type||'button'} className={`btn secondary table-action ${className}`} aria-label={label} title={props.title||label}>{children}</button>;
}
