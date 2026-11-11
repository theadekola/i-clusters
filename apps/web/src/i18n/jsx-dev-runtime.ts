import {isSvgDefinition} from './element-type';
import {jsxDEV as baseJsxDEV} from 'react/jsx-dev-runtime';
import {LocalizedElement,componentProps} from './render';
export {Fragment} from 'react/jsx-dev-runtime';
export type {JSX} from 'react/jsx-runtime';
export const jsxDEV:typeof baseJsxDEV=(type,props,key,staticChildren,source,self)=>{
  if(typeof type==='string'&&!isSvgDefinition(type))
    return baseJsxDEV(LocalizedElement,{...(props as any),as:type},key,staticChildren,source,self);
  const localized=componentProps(props);
  // LocalizedChildren can replace the original static array with one element.
  return baseJsxDEV(type,localized,key,staticChildren&&Array.isArray(localized?.children),source,self);
};
