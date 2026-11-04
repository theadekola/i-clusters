import {forwardRef,useState,type SVGProps} from 'react';
import {availableIcons} from '../fluent-icon-registry';
const known=new Set<string>(availableIcons);
export type FluentIconProps=Omit<SVGProps<SVGSVGElement>,'ref'> & {size?:number|string;absoluteStrokeWidth?:boolean};
export function iconSource(name:string){return known.has(name)?`/assets/icons/${name}.svg`:null}

/** A local, network-independent fallback with the same raised tile treatment. */
export function FluentFallback({size=24,className='',kind='service'}:{size?:number|string;className?:string;kind?:'server'|'container'|'os'|'mail'|'service'}){
 const glyph=kind==='os'?<><rect x="20" y="20" width="24" height="18" rx="3"/><path d="M27 44h10M32 38v6"/></>:kind==='server'?<><rect x="21" y="18" width="22" height="28" rx="3"/><path d="M25 26h14M25 33h14M25 40h14"/></>:kind==='mail'?<><rect x="19" y="22" width="26" height="21" rx="3"/><path d="m20 24 12 9 12-9"/></>:<path d="m23 23 9-5 9 5v17l-9 5-9-5Zm0 0 9 6 9-6M32 29v16"/>;
 return <svg className={`fluent-icon fluent-fallback ${className}`} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true"><rect x="7" y="10" width="50" height="47" rx="12" fill="#16429f"/><rect x="7" y="7" width="50" height="46" rx="12" fill="#2589e8" stroke="#9bdfff" strokeWidth="2"/><rect x="13" y="13" width="38" height="34" rx="8" fill="#13365d"/><g stroke="#95f0ed" strokeWidth="2.5" fill="none" strokeLinejoin="round">{glyph}</g></svg>;
}

/** The SVG host preserves existing ref, click, sizing and spinner contracts. */
export const FluentIcon=forwardRef<SVGSVGElement,FluentIconProps & {name:string;iconClass?:string}>(function FluentIcon({name,iconClass='',size=24,width=size,height=size,absoluteStrokeWidth:_absolute,strokeWidth:_strokeWidth,children,className='',...props},ref){
 const src=iconSource(name),[failed,setFailed]=useState('');
 const labelled=!!(props['aria-label']||props['aria-labelledby']);
 return <svg {...props} ref={ref} xmlns="http://www.w3.org/2000/svg" width={width} height={height} viewBox="0 0 64 64" fill="none" className={`fluent-icon lucide ${iconClass} ${className}`} data-fluent-icon={name} aria-hidden={props['aria-hidden']??(labelled?undefined:true)} role={props.role||(labelled?'img':undefined)}>
  {src&&failed!==src?<image href={src} width="64" height="64" preserveAspectRatio="xMidYMid meet" onError={()=>setFailed(src)}/>:<><rect x="7" y="9" width="50" height="46" rx="12" fill="#167dcc" stroke="#9deaff" strokeWidth="2"/><rect x="13" y="15" width="38" height="32" rx="8" fill="#153a68"/><path d="m24 24 8-4 8 4v14l-8 4-8-4Z" fill="#7fe5e8"/></>}
  {children}
 </svg>;
});
export function makeIcon(displayName:string,asset:string){
 const iconClass='lucide-'+displayName.replace(/([a-z0-9])([A-Z])/g,'$1-$2').replace(/([A-Z])([A-Z][a-z])/g,'$1-$2').toLowerCase();
 const Component=forwardRef<SVGSVGElement,FluentIconProps>((props,ref)=><FluentIcon {...props} ref={ref} name={asset} iconClass={iconClass}/>);
 Component.displayName=displayName;return Component;
}
