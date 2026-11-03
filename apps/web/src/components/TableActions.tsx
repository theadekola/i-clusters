import type {ButtonHTMLAttributes,ComponentProps,ReactNode} from 'react';

/** Resource rows are passive. Details are opened by their explicit action controls. */
export function InspectableRow({onInspect:_onInspect,className='',children,...props}:Omit<ComponentProps<'tr'>,'onClick'|'onKeyDown'> & {onInspect:(row:HTMLTableRowElement)=>void}){
 return <tr {...props} className={`inspectable-row ${className}`}>{children}</tr>;
}

export function TableAction({label,children,className='',...props}:ButtonHTMLAttributes<HTMLButtonElement> & {label:string;children:ReactNode}){
 return <button {...props} type={props.type||'button'} className={`btn secondary table-action ${className}`} aria-label={label} title={props.title||label}>{children}</button>;
}
