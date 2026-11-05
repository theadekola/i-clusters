import {useEffect} from 'react';
import {animate} from 'motion/react';

// Animate only newly opened surfaces, never polling updates or resource rows.
export default function InterfaceMotion(){
 useEffect(()=>{
  const preference=window.matchMedia('(prefers-reduced-motion: reduce)'),running=new Map<Element,ReturnType<typeof animate>>();
  const selector='.modal,.language-options,.profile-dropdown,.header-notification-panel';
  const reveal=(element:Element)=>{
   if(preference.matches||running.has(element))return;
   const control=animate(element as HTMLElement,{opacity:[0,1],y:[6,0],scale:[.985,1]},{duration:.18,ease:[.22,1,.36,1]});
   running.set(element,control);control.then(()=>{if(running.get(element)===control){running.delete(element);(element as HTMLElement).style.transform=''}});
  };
  const stop=()=>{for(const [element,control] of running){control.cancel();(element as HTMLElement).style.opacity='';(element as HTMLElement).style.transform=''}running.clear()};
  const changed=()=>{if(preference.matches)for(const control of running.values())control.complete()};
  const observer=new MutationObserver(records=>{
   for(const [element,control] of running)if(!element.isConnected){control.cancel();running.delete(element)}
   for(const record of records)for(const node of record.addedNodes)if(node instanceof Element){if(node.matches(selector))reveal(node);node.querySelectorAll(selector).forEach(reveal)}
  });
  observer.observe(document.body,{childList:true,subtree:true});preference.addEventListener('change',changed);
  return()=>{observer.disconnect();preference.removeEventListener('change',changed);stop()};
 },[]);
 return null;
}
