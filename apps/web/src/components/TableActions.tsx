import {Children,cloneElement,isValidElement,type ButtonHTMLAttributes,type ComponentProps,type ReactNode} from 'react';

// Resource identities open details; other cells remain passive and existing controls keep their action.
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
 return <tr {...props} className={`inspectable-row ${className}`}>{cells}</tr>;
}

export function TableAction({label,children,className='',...props}:ButtonHTMLAttributes<HTMLButtonElement> & {label:string;children:ReactNode}){
 return <button {...props} type={props.type||'button'} className={`btn secondary table-action ${className}`} aria-label={label} title={props.title||label}>{children}</button>;
}
