import {lazy,Suspense,useRef} from 'react';
import {useLocation} from 'react-router-dom';
const Shell=lazy(()=>import('../pages/Shell'));

/** Navigation hides the workspace without releasing its open sessions. */
export default function PersistentShell({authorized,consoleOnly=false}:{authorized:boolean;consoleOnly?:boolean}){
 const location=useLocation(),visited=useRef(false);
 const visible=location.pathname==='/tools/shell';
 if(visible&&authorized)visited.current=true;
 if(!authorized){visited.current=false;return null;}
 return visited.current?<div hidden={!visible} aria-hidden={!visible}><Suspense fallback={<p>Loading Shell…</p>}><Shell key={String(consoleOnly)} visible={visible} consoleOnly={consoleOnly}/></Suspense></div>:null;
}
