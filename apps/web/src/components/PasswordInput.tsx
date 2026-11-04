import {useId,useState,type InputHTMLAttributes} from 'react';
import {Eye,EyeOff} from 'lucide-react';
export default function PasswordInput(props:Omit<InputHTMLAttributes<HTMLInputElement>,'type'>){
 const [visible,setVisible]=useState(false),generated=useId(),id=props.id||generated;
 return <span className="ssh-password password-input"><input {...props} id={id} type={visible?'text':'password'}/><button type="button" className="icon-btn" disabled={props.disabled} aria-label={visible?'Hide password':'Show password'} aria-controls={id} aria-pressed={visible} onClick={()=>setVisible(v=>!v)}>{visible?<EyeOff size={17}/>:<Eye size={17}/>}</button></span>;
}
