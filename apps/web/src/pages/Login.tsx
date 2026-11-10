import {productLogo} from '../product-logo';
import { useEffect, useState } from 'react';
import { ArrowRight, Lock, User, Eye, EyeOff } from 'lucide-react';
import { api, setTokens } from '../api';

export default function Login({onLogin}:{onLogin:()=>void}){
 const[challenge,setChallenge]=useState(''),[factor,setFactor]=useState('');
 const[showPassword,setShowPassword]=useState(false),[remember,setRemember]=useState(false);
 const[username,setUsername]=useState(''),[password,setPassword]=useState(''),[error,setError]=useState(''),[loading,setLoading]=useState(false);
 const[name,setName]=useState(''),[confirmPassword,setConfirmPassword]=useState('');
 const[needsOwner,setNeedsOwner]=useState<boolean|null>(null),[message,setMessage]=useState(()=>sessionStorage.getItem('iclusters_session_message')||'');
 const checkSetup=()=>api<any>('/auth/setup').then(r=>{setNeedsOwner(!!(r.needsOwner||r.registrationOpen));setError('');}).catch(e=>setError(e.message));
 useEffect(()=>{sessionStorage.removeItem('iclusters_session_message');checkSetup()},[]);
 const submit=async(e:any)=>{
  e.preventDefault();if(loading)return;setError('');
  if(needsOwner&&password!==confirmPassword){setError('Passwords do not match.');return}
  setLoading(true);
  try{
   if(needsOwner){
    const r=await api<any>('/auth/register',{method:'POST',body:JSON.stringify({name,username,password})});
    setUsername(r.user.username);setPassword('');setConfirmPassword('');setShowPassword(false);setNeedsOwner(false);setMessage('Owner account created. Sign in to continue.');return;
   }
   const r=await api<any>(challenge?'/auth/mfa':'/auth/login',{method:'POST',body:JSON.stringify(challenge?{challengeToken:challenge,code:factor}:{username,password,remember})});
   if(r.mfaRequired){setChallenge(r.challengeToken);setPassword('');setFactor('');setMessage('Enter your authenticator code or one unused recovery code.');return}
   setTokens(r.accessToken,r.refreshToken,remember,r.rememberUntil,r.cookieSession===true);onLogin();
  }catch(e:any){
   if(needsOwner&&e.status===409){setNeedsOwner(false);setPassword('');setConfirmPassword('');setMessage(e.message)}
   else setError(e.message);
  }finally{setLoading(false)}
 };
 const logo=<div className="login-logo"><img className="iclusters-product-logo" src={productLogo} alt=""/><strong><span>i-</span>Clusters</strong></div>;
 if(needsOwner===null)return <div className="login-page"><div className="login-card">{logo}<h1>Welcome to i-Clusters</h1>{error?<><p role="alert" className="login-error">{error}</p><button className="btn primary" onClick={checkSetup}>Retry</button></>:<p>Checking first-use setup…</p>}</div></div>;
 return <div className="login-page"><form className="login-card" onSubmit={submit}>{logo}<h1>{needsOwner?'Create your owner account':'Sign in to your account'}</h1><p className="muted">{needsOwner?'Register the first owner to finish setting up i-Clusters.':'Your infrastructure, connected.'}</p>{error&&<div role="alert" className="login-error">{error}</div>}{message&&<p role="status">{message}</p>}
  {needsOwner&&<label><span><User size={15}/> Full name</span><input id="registration-name" value={name} onChange={e=>setName(e.target.value)} autoComplete="name" maxLength={100} disabled={loading} required/></label>}
  {!challenge&&<><label><span><User size={15}/> Username</span><input value={username} onChange={e=>setUsername(e.target.value)} type="text" placeholder="Enter your username" autoCapitalize="none" spellCheck={false} maxLength={needsOwner?64:254} pattern={needsOwner?'[A-Za-z0-9](?:[A-Za-z0-9_.]|-){2,63}':undefined} autoComplete="username" disabled={loading} required/></label>
  <label><span><Lock size={15}/> Password</span><div className="login-password"><input id="login-password" placeholder="Enter your password" value={password} onChange={e=>setPassword(e.target.value)} type={showPassword?'text':'password'} autoComplete={needsOwner?'new-password':'current-password'} minLength={needsOwner?12:undefined} maxLength={needsOwner?72:undefined} disabled={loading} required/><button type="button" className="icon-btn" disabled={loading} aria-label={showPassword?'Hide password':'Show password'} aria-pressed={showPassword} aria-controls={needsOwner?['login-password','registration-confirm-password'].join(' '):'login-password'} onClick={()=>setShowPassword(v=>!v)}>{showPassword?<EyeOff size={19}/>:<Eye size={19}/>}</button></div>{needsOwner&&<small className="muted">Use at least 12 characters.</small>}</label></>}
  {needsOwner&&<label><span><Lock size={15}/> Confirm password</span><input id="registration-confirm-password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} type={showPassword?'text':'password'} autoComplete="new-password" minLength={12} maxLength={72} disabled={loading} required/></label>}
  {challenge&&<><label><span>Authenticator or recovery code</span><input value={factor} onChange={e=>setFactor(e.target.value)} autoComplete="one-time-code" autoFocus maxLength={40} required/></label><button type="button" className="btn secondary" onClick={()=>{setChallenge('');setFactor('');setMessage('');setError('')}}>Back to sign in</button></>}
  {!needsOwner&&!challenge&&<label className="login-remember"><input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)}/><span>Remember this device</span></label>}
  <button className="btn primary" disabled={loading} aria-busy={loading}>{loading?'Please wait…':needsOwner?'Create owner account':challenge?'Verify & Sign in':'Sign in'}<ArrowRight size={18}/></button><footer className="brand-links"><a href="https://www.i-clusters.com" target="_blank" rel="noopener noreferrer">www.i-clusters.com</a><a href="https://support.i-clusters.com" target="_blank" rel="noopener noreferrer">Support</a></footer>
 </form></div>;
}
