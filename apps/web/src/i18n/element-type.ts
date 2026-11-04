import {isValidElement} from 'react';
// Structural inspection must not load the locale store or language packs.
export const isValueElement=(value:any)=>isValidElement(value)&&!!(value.type as any)?.localeValue;
export const nativeChildren=(value:any)=>isValueElement(value)?value.props.value:value.props.children;
export const nativeTag=(element:any)=>(element.type as any)?.localeTag?element.props.as:element.type;
