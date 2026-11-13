import {useEffect,useRef,useState} from 'react';
import {Modal} from './UI';

type Choice={message:string;resolve:(accepted:boolean)=>void};

export default function ConfirmChoiceDialog(){
 const [choice,setChoice]=useState<Choice|null>(null);
 const current=useRef<Choice|null>(null);
 useEffect(()=>{
  const receive=(event:Event)=>{
   event.preventDefault();
   const request=(event as CustomEvent<Choice>).detail;
   if(current.current){request.resolve(false);return}
   current.current=request;
   setChoice(request);
  };
  window.addEventListener('iclusters-confirm-choice',receive);
  return ()=>{
   window.removeEventListener('iclusters-confirm-choice',receive);
   current.current?.resolve(false);
   current.current=null;
  };
 },[]);
 const finish=(accepted:boolean)=>{
  const request=current.current;
  current.current=null;
  setChoice(null);
  request?.resolve(accepted);
 };
 return <Modal portal open={!!choice} title="Confirm Action" onClose={()=>finish(false)}>
  <p>{choice?.message}</p>
  <div className="modal-actions confirmation-actions">
   <button type="button" className="btn secondary" onClick={()=>finish(false)}>Cancel</button>
   <button type="button" className="btn primary" onClick={()=>finish(true)}>Confirm</button>
  </div>
 </Modal>;
}
