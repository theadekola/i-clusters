// A document and its pending promises are bound to one cluster. A switch loads
// a new document, so changing tabs or reloading cannot retarget an approved job.
const path=globalThis.window?.location?.pathname||'/';
const segment=path.match(/^\/clusters\/([^/]+)(?:\/|$)/)?.[1];
export const clusterId=segment||'default';
export const clusterBase=segment?'/clusters/'+segment:'';
export const connectorBase=segment?'/api/cluster-profiles/'+encodeURIComponent(segment):'';
const controllerRoute=/^\/(?:auth|account|users|product|updates|cluster-profiles)(?:[/?]|$)/;
export function clusterApiPath(route:string){return (controllerRoute.test(route)?'':connectorBase)+'/api'+route}
export function clusterStorageKey(key:string){return segment?key+':cluster:'+segment:key}
export function clusterLocation(id:string,route='/proxmox'){
  return (id==='default'?'':'/clusters/'+encodeURIComponent(id))+route;
}
let activeName='';
export function nameCluster(name:string){activeName=name}
export function approvalDescription(detail?:string){
  return activeName?[`Cluster: ${activeName}`,detail].filter(Boolean).join(' · '):detail;
}
