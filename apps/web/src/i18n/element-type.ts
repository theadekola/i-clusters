import {isValidElement} from 'react';
// Structural inspection must not load the locale store or language packs.
export const isValueElement=(value:any)=>isValidElement(value)&&!!(value.type as any)?.localeValue;
export const nativeChildren=(value:any)=>isValueElement(value)?value.props.value:value.props.children;
export const nativeTag=(element:any)=>(element.type as any)?.localeTag?element.props.as:element.type;

// Chart libraries inspect definition nodes before React renders them. Preserve
// these native SVG types and their identifiers; they contain no interface copy.
const svgDefinitions=new Set(['defs','linearGradient','radialGradient','stop','clipPath','mask','pattern','marker','filter']);
export const isSvgDefinition=(type:any)=>typeof type==='string'&&(svgDefinitions.has(type)||/^fe[A-Z]/.test(type));
