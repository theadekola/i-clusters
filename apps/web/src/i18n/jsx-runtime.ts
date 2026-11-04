import {isSvgDefinition} from './element-type';
import {jsx as baseJsx,jsxs as baseJsxs} from 'react/jsx-runtime';
import {LocalizedElement,componentProps} from './render';
export {Fragment} from 'react/jsx-runtime';
export type {JSX} from 'react/jsx-runtime';
export const jsx:typeof baseJsx=(type,props,key)=>typeof type==='string'&&!isSvgDefinition(type)?baseJsx(LocalizedElement,{...(props as any),as:type},key):baseJsx(type,componentProps(props),key);
export const jsxs:typeof baseJsxs=(type,props,key)=>typeof type==='string'&&!isSvgDefinition(type)?baseJsxs(LocalizedElement,{...(props as any),as:type},key):baseJsxs(type,componentProps(props),key);
