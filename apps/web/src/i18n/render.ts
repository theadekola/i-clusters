import React,{createContext,useContext,type ReactNode} from 'react';
import {translate,useLocale,template} from './locale';
import {isValueElement} from './element-type';
export {isValueElement,nativeChildren,nativeTag} from './element-type';
const Verbatim=createContext(false);
export function RawValue({value}:{value:ReactNode}){return value}
RawValue.localeValue=true;
export const raw=(value:ReactNode)=>React.createElement(RawValue,{value});
export const dataOr=(value:any,fallback:()=>any,nullish=false)=>(nullish?value!==null&&value!==undefined:!!value)?raw(value):fallback();
const technical=/\b(login-logo|row-content-name|docker-container-name|docker-image|image-name|configuration-id|pve-node-name|vm-row-name|restore-row-name|task-id|image-digest|audit-ip|terminal-output|ssh-fingerprint)\b/;
export function LocalizedValue({value}:{value:any}){const locale=useLocale(),verbatim=useContext(Verbatim);return verbatim?value:typeof value==='string'?translate(value,locale):Array.isArray(value)?value.map(item=>typeof item==='string'?translate(item,locale):item):value}
LocalizedValue.localeValue=true;
export const localizedValue=(value:any)=>React.createElement(LocalizedValue,{value});
function plain(value:any):any{if(typeof value==='string'||typeof value==='number')return value;if(isValueElement(value))return plain(value.props.value);if(Array.isArray(value)){const parts=value.map(plain);if(parts.every(part=>part!==undefined))return parts.join('')}return undefined}
function textChildren(value:any,locale:ReturnType<typeof useLocale>):any{
 if(typeof value==='string')return translate(value,locale);
 if(!Array.isArray(value))return value;
 const slots:any[]=[],key=value.map(item=>typeof item==='string'?item:'{'+(slots.push(item)-1)+'}').join('').replace(/\s+/g,' ').trim();
 const message=slots.length&&value.some(item=>typeof item==='string'&&/[A-Za-z]/.test(item))?template(key,locale):undefined;
 if(message){let part=0;return message.split(/(\{\d+\})/g).filter(Boolean).map(text=>{const match=text.match(/^\{(\d+)\}$/);return match?React.createElement(React.Fragment,{key:'slot-'+match[1]},slots[Number(match[1])]):React.createElement(React.Fragment,{key:'text-'+part++},text)})}
 let slot=0,part=0;return value.map(item=>typeof item==='string'?React.createElement(React.Fragment,{key:'text-'+part++},translate(item,locale)):React.createElement(React.Fragment,{key:'slot-'+slot++},item));
}
export function LocalizedElement({as,...original}:any){
 const locale=useLocale(),parentRaw=useContext(Verbatim),verbatim=parentRaw||original.translate==='no'||['pre','code','kbd','samp','textarea','script','style'].includes(as)||technical.test(original.className||'');
 const props={...original};delete props.__localeRawAttrs;
 if(!verbatim){for(const key of ['title','placeholder','aria-label','aria-description','alt'])if(typeof props[key]==='string'&&!original.__localeRawAttrs?.includes(key))props[key]=translate(props[key],locale);props.children=textChildren(props.children,locale)}
 if(as==='option'&&original.value===undefined){const value=plain(original.children);if(value!==undefined)props.value=value}
 if(verbatim&&props.dir===undefined&&!['pre','code','textarea','script','style'].includes(as))props.dir='auto';
 const element=React.createElement(as,props);return verbatim&&!parentRaw?React.createElement(Verbatim.Provider,{value:true},element):element;
}
LocalizedElement.localeTag=true;
export function LocalizedChildren({value}:{value:any}){const locale=useLocale(),verbatim=useContext(Verbatim);return verbatim?value:textChildren(value,locale)}
// Formatting whitespace is structural: wrapping chart children hides axes and series
// from libraries that inspect their direct React children.
export function componentProps(props:any){return props&&(typeof props.children==='string'&&props.children.trim().length>0||Array.isArray(props.children)&&props.children.some((item:any)=>typeof item==='string'&&item.trim().length>0))?{...props,children:React.createElement(LocalizedChildren,{value:props.children})}:props}
