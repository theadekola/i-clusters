import {useLocale} from './i18n/locale';
import ReportLoading from './components/ReportLoading';
import {isSoftwareUpdating} from './software-update-state';
import {startSessionActivity} from './session';

import {useApi} from './hooks';
import ConfirmChoiceDialog from './components/ConfirmChoiceDialog';
import ActionConfirmation from './components/ActionConfirmation';
import {SSHApproval} from './components/SSHAccess';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { api, clearTokens, getAccessToken } from './api';
import {clusterId,clusterLocation} from './cluster-context';
import Layout from './components/Layout';
import Login from './pages/Login';
const Dashboard=lazy(()=>import('./pages/Dashboard'));
const Proxmox=lazy(()=>import('./pages/Proxmox'));
const Docker=lazy(()=>import('./pages/Docker'));
const Storage=lazy(()=>import('./pages/Storage'));
const Network=lazy(()=>import('./pages/Network'));
const Backups=lazy(()=>import('./pages/Backups'));
const Monitoring=lazy(()=>import('./pages/Monitoring'));
const Alerts=lazy(()=>import('./pages/Alerts'));
const AI=lazy(()=>import('./pages/AI'));
const Users=lazy(()=>import('./pages/Users'));
const DeliveryHistory=lazy(()=>import('./pages/DeliveryHistory'));
const Settings=lazy(()=>import('./pages/Settings'));
const Shell=lazy(()=>import('./pages/Shell'));

export default function App(){
 useLocale();
 const location=useLocation();
 const [connectionError,setConnectionError]=useState(''),[updating,setUpdating]=useState(isSoftwareUpdating);
 useEffect(()=>{const changed=()=>setUpdating(isSoftwareUpdating());window.addEventListener('iclusters-software-update',changed);const timer=window.setInterval(changed,10000);return()=>{window.removeEventListener('iclusters-software-update',changed);window.clearInterval(timer)}},[]);
 const[authenticated,setAuthenticated]=useState<boolean|null>(null);
 const checking=useRef(false);
 const check=useCallback(async()=>{
  if(checking.current)return;
  const checkedAccess=getAccessToken();
  if(!checkedAccess){setConnectionError('');setAuthenticated(false);return}
  checking.current=true;
  try{const session=await api('/auth/me');if(session?.user?.role==='none'){
   const {clusters}=await api('/cluster-profiles');const first=clusters?.[0];
   if(first&&first.id!==clusterId){sessionStorage.removeItem('iclusters_ai_conversation');window.location.replace(clusterLocation(first.id));return}
  }setConnectionError('');setAuthenticated(!!getAccessToken())}
  catch(e:any){if(e.status===401){if(getAccessToken()===checkedAccess)clearTokens();setConnectionError('');setAuthenticated(!!getAccessToken())}else setConnectionError(e.message||'Cannot reach i-Clusters.')}
  finally{checking.current=false}
 },[]);
 useEffect(()=>{const stopActivity=startSessionActivity();void check();const expired=()=>{setConnectionError('');setAuthenticated(false)};const unavailable=(e:any)=>setConnectionError(e.detail||'Connection temporarily unavailable.');window.addEventListener('iclusters-session-unavailable',unavailable);window.addEventListener('iclusters-session-expired',expired);return()=>{stopActivity();window.removeEventListener('iclusters-session-expired',expired);window.removeEventListener('iclusters-session-unavailable',unavailable)}},[check]);
 useEffect(()=>{
  if(!connectionError)return;
  const retry=()=>{if(document.visibilityState!=='hidden')void check()},visible=()=>{if(document.visibilityState==='visible')retry()};
  const timer=window.setInterval(retry,10000);
  window.addEventListener('online',retry);window.addEventListener('focus',retry);document.addEventListener('visibilitychange',visible);
  return()=>{window.clearInterval(timer);window.removeEventListener('online',retry);window.removeEventListener('focus',retry);document.removeEventListener('visibilitychange',visible)};
 },[connectionError,check]);
 const connectionNotice=connectionError&&!updating&&<div className="connection-notice" role="alert"><p><strong>Connection interrupted. Reconnecting automatically.</strong> {connectionError} <a href="/connection-check.html" target={authenticated?'_blank':'_self'} rel="noopener">Connection diagnostics</a></p><button className="btn secondary" onClick={()=>void check()}>Retry connection</button></div>;
 if(authenticated===null||(connectionError&&!authenticated))return <div className="login-page">{connectionNotice||<ReportLoading message="Loading i-Clusters…"/>}</div>;
 if(!authenticated)return <Login onLogin={()=>setAuthenticated(true)}/>;
 return <>{connectionNotice}<Suspense fallback={<ReportLoading message="Loading page…"/>}><Routes><Route element={<Layout/>}><Route path="/" element={<Dashboard/>}/><Route path="/proxmox" element={<Proxmox/>}/><Route path="/docker" element={<Docker/>}/><Route path="/storage" element={<Storage/>}/><Route path="/network" element={<Network/>}/><Route path="/backups" element={<Backups/>}/><Route path="/schedules" element={<BackupRedirect tab="Schedules"/>}/><Route path="/retention" element={<BackupRedirect tab="Retention Policies"/>}/><Route path="/restore" element={<BackupRedirect tab="Restore Points"/>}/><Route path="/monitoring" element={<Monitoring/>}/><Route path="/alerts" element={<Alerts/>}/><Route path="/ai" element={<AI/>}/><Route path="/users" element={<RoleGate roles={['auditor','operator','admin','owner']}><Users/></RoleGate>}/><Route path="/audit" element={<Navigate to="/users?tab=Audit%20Logs" replace/>}/><Route path="/tools/sftp" element={<RoleGate roles={['admin','owner']}><Shell key="sftp" mode="sftp"/></RoleGate>}/><Route path="/tools/shell" element={<RoleGate roles={['admin','owner']}><span/></RoleGate>}/><Route path="/settings" element={<Settings/>}/><Route path="/settings/delivery-history" element={<RoleGate roles={['owner']}><DeliveryHistory/></RoleGate>}/><Route path="*" element={<div className="card"><h1>Page not found</h1><p>This address does not match a page.</p><Link className="btn primary" to="/">Back to Dashboard</Link></div>}/></Route></Routes></Suspense><SSHApproval/><ActionConfirmation/><ConfirmChoiceDialog key={location.pathname+location.search}/></>
}

function BackupRedirect({tab}:{tab:string}){const location=useLocation();const query=new URLSearchParams(location.search);query.set('tab',tab);return <Navigate to={`/backups?${query}`} replace/>;}
function RoleGate({roles,children}:{roles:string[];children:any}){const session=useApi<any>('/auth/me',null);if(!session.data)return <div className="card"><p>{session.error||'Checking access…'}</p>{session.error&&<button className="btn secondary" onClick={()=>session.refresh()}>Retry</button>}</div>;return roles.includes(session.data.user.role)?children:<div className="card"><h1>Access denied</h1><p>Your role cannot access this page.</p><Link className="btn primary" to="/">Back to Dashboard</Link></div>}
