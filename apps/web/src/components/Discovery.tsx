import {useState} from 'react';
import {Card} from './UI';
import {DataTable} from './DataTable';
export default function Discovery({resources=[]}:{resources?:any[];reports?:any[]}){
 const [search,setSearch]=useState('');
 const rows=resources.filter(r=>(r.name+' '+r.host).toLowerCase().includes(search.toLowerCase()));
 return <Card><h3>Automatically discovered services</h3><div className="header-actions"><input aria-label="Search discovered services" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search services or host"/></div>{rows.length?<DataTable rows={rows.slice(0,100)} columns={['name','host','kind','status','source'].map(key=>({key,label:key}))}/>:<p>No services visible to the connected credentials.</p>}</Card>;
}
