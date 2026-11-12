// Optional per-VM reads must not block inventory from healthy nodes.
export function createVmReadingCache(path,parse,{budget=250,ttl=30000}={}){
 const connections=new Map();
 const keyOf=guest=>`${guest.node}/${guest.vmid}`;
 return async(guests,query,identity)=>{
  let state=connections.get(identity);
  if(!state){
   state={values:new Map(),time:0,pending:null};
   connections.set(identity,state);
   if(connections.size>16)connections.delete(connections.keys().next().value);
  }

  if(!state.pending&&Date.now()-state.time>=ttl){
   const active=new Set(guests.map(keyOf));
   for(const key of state.values.keys())if(!active.has(key))state.values.delete(key);
   let index=0;
   const worker=async()=>{
    while(index<guests.length){
     const guest=guests[index++],key=keyOf(guest);
     try{
      const base=`/nodes/${encodeURIComponent(guest.node)}/qemu/${encodeURIComponent(guest.vmid)}`;
      const data=await query(`${base}/${path}`,{timeoutMs:5000});
      state.values.set(key,{value:await parse(data,guest,query),sampledAt:Date.now()});
     }catch{
      state.values.delete(key);
     }
    }
   };
   state.pending=Promise.all(Array.from({length:Math.min(4,guests.length)},worker))
    .finally(()=>{state.time=Date.now();state.pending=null;});
  }
  if(state.pending){
   let timer;
   const deadline=new Promise(resolve=>{timer=setTimeout(resolve,budget)});
   await Promise.race([state.pending,deadline]).finally(()=>clearTimeout(timer));
  }
  return new Map(guests.map(guest=>{
   const entry=state.values.get(keyOf(guest));
   return [String(guest.vmid),entry&&Date.now()-entry.sampledAt<=2*ttl?entry.value:undefined];
  }));
 };
}
