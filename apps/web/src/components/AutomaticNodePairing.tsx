import {Link} from 'react-router-dom';
import GuestBootstrap from './GuestBootstrap';
import PasswordInput from './PasswordInput';
import ReportLoading from './ReportLoading';
import RefreshButton from './RefreshButton';
import {useEffect,useRef,useState} from 'react';
import {api,setDockerHost} from '../api';
import {ConnectionSuccess} from './UI';
export default function AutomaticNodePairing({node,onComplete,onBusy,kind='proxmox'}:{kind?:'proxmox'|'docker';node:string;onComplete:()=>void;onBusy:(busy:boolean)=>void}){
 const [target,setTarget]=useState<any>(null),[port,setPort]=useState('22'),[username,setUsername]=useState('root'),[password,setPassword]=useState(''),[fingerprint,setFingerprint]=useState(''),[consent,setConsent]=useState(false),[checking,setChecking]=useState(false),[error,setError]=useState(''),[job,setJob]=useState<any>(null),[submitting,setSubmitting]=useState(false),[retry,setRetry]=useState(0),[reading,setReading]=useState(false);
 const [installDocker,setInstallDocker]=useState(false);
 const [agentSetupOpen,setAgentSetupOpen]=useState(false),[agentBusy,setAgentBusy]=useState(false);
 const [resumeJob,setResumeJob]=useState('');
 const endpoint='/node-agents/'+(kind==='docker'?'automatic-docker-pairing':'automatic-pairing');
 const secure=window.location.protocol==='https:',busy=submitting||['connecting','checking','installing','verifying'].includes(job?.state),alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
 useEffect(()=>{onBusy(busy||agentBusy);return()=>onBusy(false)},[busy,agentBusy,onBusy]);
 useEffect(()=>{const controller=new AbortController();setReading(true);setTarget((previous:any)=>previous?.guestAgentSetup?previous:null);setFingerprint('');setConsent(false);setError('');api(endpoint+'/target?node='+encodeURIComponent(node),{signal:controller.signal}).then(r=>{if(!controller.signal.aborted){setTarget(r);if(!r.guestAgentSetup)setAgentSetupOpen(false);if(r.job?.id!==resumeJob||r.job?.state!=='interrupted')setJob(r.job||null)}}).catch(e=>{if(!controller.signal.aborted){setTarget(null);setError(e.message)}}).finally(()=>{if(!controller.signal.aborted)setReading(false)});return()=>controller.abort()},[node,retry,resumeJob]);
 useEffect(()=>{setFingerprint('');setChecking(false);if(!target?.host||!secure||busy||job?.id)return;const controller=new AbortController();setChecking(true);const timer=setTimeout(()=>api('/ssh/fingerprint',{method:'POST',signal:controller.signal,body:JSON.stringify({host:target.host,port,target:target.sshTarget||'node:'+node})}).then(r=>{if(!controller.signal.aborted){if(!r.fingerprint)throw Error('No SSH fingerprint was returned.');setFingerprint(r.fingerprint)}}).catch(e=>{if(!controller.signal.aborted)setError(e.message)}).finally(()=>{if(!controller.signal.aborted)setChecking(false)}),250);return()=>{clearTimeout(timer);controller.abort()}},[target,port,node,secure,busy,job?.id]);
 useEffect(()=>{if(!job?.id||!['connecting','checking','installing','verifying','unverified','interrupted'].includes(job.state))return;const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;const poll=async()=>{try{const result=await api(endpoint+'/'+encodeURIComponent(job.id),{signal:controller.signal});if(!controller.signal.aborted){setJob(result.job);setError('');if(['connecting','checking','installing','verifying','unverified','interrupted'].includes(result.job.state))timer=setTimeout(poll,2000)}}catch(e:any){if(!controller.signal.aborted){setError(e.message+' Installation may still be running; this page will recheck.');timer=setTimeout(poll,3000)}}};timer=setTimeout(poll,1000);return()=>{clearTimeout(timer);controller.abort()}},[job?.id]);
 const submit=async(e:React.FormEvent)=>{e.preventDefault();if(!secure||busy||!target?.host||!fingerprint||!consent||job)return;setSubmitting(true);setError('');const body={resumeJob,installDocker,node,host:target.host,port:Number(port),username,password,fingerprint,connectionId:target.connectionId,confirm:true,verified:!!fingerprint};setPassword('');try{const result=await api(endpoint,{method:'POST',body:JSON.stringify(body)});if(alive.current)setJob(result.job)}catch(e:any){if(alive.current)setError(e.message)}finally{body.password='';if(alive.current)setSubmitting(false)}};
 if(job?.state==='completed')return <ConnectionSuccess message={job.message} onDone={()=>{if(kind==='docker')setDockerHost(job.agentId+':node');onComplete()}}/>;
 const guest=target?.guestAgentSetup;
 if(kind==='docker'&&guest&&!job){
  const recheck=()=>{setPassword('');setRetry(value=>value+1)};
  return <section className="node-pairing">
   <h4>{guest.name} · VM {guest.vmid} · {guest.node}</h4>
   <p>Set up QEMU Guest Agent so Proxmox can find this VM’s Docker host address.</p>
   {!secure&&<p className="cluster-wide error" role="alert">Open i-Clusters over HTTPS before using SSH installation.</p>}
   {agentSetupOpen&&<fieldset className="guest-agent-installer" disabled={reading}><GuestBootstrap purpose="guest-agent" node={{name:guest.node}} guest={{id:'qemu/'+guest.vmid,name:guest.name}} onBusy={setAgentBusy}
      onReady={result=>{if(result.agentVerified&&!result.requiresPowerCycle)recheck()}}/></fieldset>}
   <div className="connection-setup-actions">
   {!agentSetupOpen&&<button type="button" className="btn primary" disabled={!secure||reading} onClick={()=>setAgentSetupOpen(true)}>Install QEMU Guest Agent</button>}
   <RefreshButton indicator className="btn secondary" aria-busy={reading} disabled={agentBusy||reading} onClick={recheck}>Recheck Guest Agent</RefreshButton>
   </div>
   {!agentBusy&&<p className="muted">Automatic agent installation supports Debian and Ubuntu. For ZimaOS or another appliance with a configured Docker HTTPS endpoint, use <Link to="/settings?tab=Connections&amp;setup=direct">Direct Docker API</Link>.</p>}
  </section>;
 }
 if(kind==='docker'&&reading&&!job)return <p role="status"><ReportLoading inline/>Checking Docker host access…</p>;
 return <form className="form-grid automatic-node-pairing" onSubmit={submit}>
 <p className="cluster-wide">Install the connector on <b>{node}</b>. It runs as root and grants this controller access to manage Docker.</p>
 <p className="cluster-wide muted">Use a Linux root or sudo account. The password is used once.</p>
 {!secure&&<p className="cluster-wide error" role="alert">Open i-Clusters over HTTPS before entering SSH credentials.</p>}
 {target?.host&&<><div className="ssh-dialog-row ssh-address-row"><label>Node SSH address<input aria-label="Node SSH address" value={target.host} readOnly/></label><label>SSH port<input aria-label="SSH port" type="number" min="1" max="65535" required value={port} disabled={busy||!!job} onChange={e=>setPort(e.target.value)}/></label></div>
 <details className="cluster-wide dialog-details"><summary>Connection details</summary><p>Controller: {target.controller}</p><p>Removing the connection revokes access. Uninstall the service separately on the host.</p></details>
 <div className="ssh-dialog-row ssh-credentials-row"><label>SSH username<input aria-label="SSH username" required value={username} disabled={busy||!!job||!secure} onChange={e=>setUsername(e.target.value)} autoComplete="username"/></label><label>SSH / sudo password<PasswordInput aria-label="SSH / sudo password" required value={password} disabled={busy||!!job||!secure} onChange={e=>setPassword(e.target.value)} autoComplete="new-password"/></label></div>
 {!job&&<><p className="cluster-wide muted ssh-host-status" role="status">{checking?'Checking SSH host identity automatically…':!fingerprint?'SSH host verification is required before continuing.':'SSH host key checked automatically.'}</p>{!fingerprint&&!checking&&<button type="button" className="btn secondary small" disabled={busy||!secure} onClick={()=>setRetry(v=>v+1)} aria-label="Retry SSH verification">Retry SSH verification</button>}
 {kind==='docker'&&<label className="cluster-wide"><span><input type="checkbox" checked={installDocker} onChange={e=>setInstallDocker(e.target.checked)}/> Install Docker if missing on Debian or Ubuntu and start its service if needed.</span></label>}
 <label className="cluster-wide"><span><input aria-label="Approve automatic node pairing" type="checkbox" required checked={consent} disabled={busy||!!job} onChange={e=>setConsent(e.target.checked)}/> Install the connector and start its service on {node}.</span></label></>}</>}
 {job&&<p role={job.state==='failed'?'alert':'status'} className={job.state==='failed'?'cluster-wide error':'cluster-wide'}>{!['completed','failed','unverified','interrupted'].includes(job.state)&&<ReportLoading inline/>}{job.message}</p>}{error&&<p role="alert" className="cluster-wide error">{error}</p>}
 <div className="action-row">{!job&&<><button type="submit" className="btn primary" aria-busy={!!(busy||checking)} disabled={!secure||busy||checking||!target?.host||!fingerprint||!consent||!password||!username}>{busy?'Starting setup…':'Install, Pair & Verify Automatically'}</button><RefreshButton indicator type="button" className="btn secondary" aria-busy={reading||checking} disabled={busy} onClick={()=>{setRetry(r=>r+1);setPassword('')}}>Recheck Node</RefreshButton></>}
 {(job?.state==='failed'||job?.state==='interrupted')&&<button type="button" className="btn secondary" onClick={()=>{
  setResumeJob(job.state==='interrupted'?job.id:'');
  if(job.action==='docker-missing'||job.action==='docker-start')setInstallDocker(true);
  setPassword('');setConsent(false);setFingerprint('');setTarget(null);setJob(null);setRetry(value=>value+1);
 }}>{job.state==='interrupted'?'Resume setup':job.action==='docker-missing'?'Install Docker and retry':job.action==='docker-start'?'Start Docker and retry':'Retry pairing'}</button>}</div>
 {job?.state==='unverified'&&<p className="cluster-wide muted">Inspect the connector service on the node before retrying. Existing installations are protected from overwriting.</p>}
 </form>;
}
