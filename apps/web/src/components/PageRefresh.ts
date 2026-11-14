import {createContext,useContext,useLayoutEffect,useMemo,useRef} from 'react';

type ReadAction=()=>unknown;
type Reader={current:{read?:ReadAction;disabled?:boolean}};
function createPageRefresh(){
 const readers=new Set<Reader>();
 return {
  register(reader:Reader){readers.add(reader);return ()=>{readers.delete(reader)}},
  async refresh(fallback:ReadAction){
   if(!readers.size){await fallback();return}
   const actions=new Set<ReadAction>();
   for(const {current} of readers)if(current.read&&!current.disabled)actions.add(current.read);
   const results=await Promise.allSettled(Array.from(actions,read=>Promise.resolve().then(read)));
   for(const result of results)if(result.status==='rejected')throw result.reason;
  }
 };
}
export const PageRefreshContext=createContext<ReturnType<typeof createPageRefresh>|null>(null);
export function usePageRefreshController(){return useMemo(createPageRefresh,[])}
export function usePageRefreshAction(read:ReadAction|undefined,disabled:boolean,local:boolean){
 const controller=useContext(PageRefreshContext);
 const reader=useRef({read,disabled});
 useLayoutEffect(()=>{reader.current={read,disabled}},[read,disabled]);
 useLayoutEffect(()=>{if(controller&&!local)return controller.register(reader)},[controller,local]);
 return !!controller&&!local;
}
