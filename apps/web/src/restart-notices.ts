import {clusterStorageKey} from './cluster-context';

const storageKey=clusterStorageKey('iclusters-restart-notices');
const displayed=new Set<string>();
const openDialogs=new Set<string>();

// A foreground restart dialog presents its own completion message.
export function watchRestartDialog(id:string){
 openDialogs.add(id);
 return ()=>{openDialogs.delete(id);window.dispatchEvent(new Event('iclusters-restart-dialog-closed'))};
}
export function hasRestartDialog(id:string){return openDialogs.has(id)}

export function claimRestartNotice(id:string){
 try{
  const saved:unknown=JSON.parse(localStorage.getItem(storageKey)||'[]');
  if(Array.isArray(saved))for(const item of saved)if(typeof item==='string')displayed.add(item);
 }catch{}
 if(displayed.has(id))return false;
 displayed.add(id);
 // The server returns at most ten recent finished attempts per user and cluster.
 if(displayed.size>64)displayed.delete(displayed.values().next().value!);
 try{localStorage.setItem(storageKey,JSON.stringify([...displayed].slice(-64)))}catch{}
 return true;
}
