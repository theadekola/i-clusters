import {isSvgDefinition} from './element-type';
import {jsxDEV as baseJsxDEV} from 'react/jsx-dev-runtime';
import {LocalizedElement,componentProps} from './render';
export {Fragment} from 'react/jsx-dev-runtime';
export type {JSX} from 'react/jsx-runtime';
export const jsxDEV:typeof baseJsxDEV=(type,props,key,staticChildren,source,self)=>typeof type==='string'&&!isSvgDefinition(type)?baseJsxDEV(LocalizedElement,{...(props as any),as:type},key,staticChildren,source,self):baseJsxDEV(type,componentProps(props),key,staticChildren,source,self);
