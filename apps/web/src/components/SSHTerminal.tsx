import {readShellOutput,shellInputQueue} from '../shell-stream';
import {useShellPresence,useSSHSession} from '../ssh-session';
import {fullscreenTerminal,exitTerminalFullscreen} from '../ssh-transfer';
import {useEffect,useRef,useState} from 'react';
import {Terminal} from '@xterm/xterm';
import {FitAddon} from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import './ssh-terminal.css';
import {api} from '../api';
import {Modal} from './UI';
import {Maximize,Minimize,Terminal as TerminalIcon} from 'lucide-react';
import GuestRestartDialog from './GuestRestartDialog';
import {SSHLogin} from './SSHAccess';
import {useTerminalTools} from './TerminalTools';
const OUTPUT_READ_TIMEOUT_MS=20000;

export default function SSHTerminal({target,host,sessionId,updateTab=false,onUpdateSession,onDisconnect,active=true,name}:{target:string;updateTab?:boolean;onUpdateSession?:(id:string)=>void;host?:string;sessionId?:string;active?:boolean;name?:string;onDisconnect?:()=>void}){
 const [result,setResult]=useState<{osVersion:string;rebootRequired:boolean}|null>(null);
 const [restartOpen,setRestartOpen]=useState(false);
 const guest=/^(vm|lxc):([^:]+):(\d+)$/.exec(target);
 const resizeTerminal=useRef<null|(()=>void)>(null);
 const [checking,setChecking]=useState(false);
 const [inputError,setInputError]=useState(''),[resuming,setResuming]=useState(false);
 const resumeTyping=useRef<null|(()=>Promise<void>)>(null);
 const [expanded,setExpanded]=useState(false);
 const [id,setId]=useState(sessionId||''),[error,setError]=useState(''),ref=useRef<HTMLDivElement>(null),terminalRef=useRef<Terminal|null>(null),fitRef=useRef<FitAddon|null>(null),shellRef=useRef<HTMLDivElement>(null);
 const [canPaste,setCanPaste]=useState(false);
 const activeRef=useRef(active);
 activeRef.current=active;
 const tools=useTerminalTools(terminalRef,active,id,canPaste,resizeTerminal);
 useEffect(()=>{
  const element=shellRef.current;if(!element)return;
  const sync=()=>setExpanded(document.fullscreenElement===element);
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'&&element.classList.contains('terminal-expanded')){void exitTerminalFullscreen(element);setExpanded(false);}};
  const viewport=()=>{const v=window.visualViewport;element.style.setProperty('--terminal-viewport-height',`${v?.height||window.innerHeight}px`);element.style.setProperty('--terminal-viewport-top',`${v?.offsetTop||0}px`);};
  viewport();document.addEventListener('fullscreenchange',sync);document.addEventListener('keydown',escape);window.visualViewport?.addEventListener('resize',viewport);window.visualViewport?.addEventListener('scroll',viewport);window.addEventListener('resize',viewport);
  return()=>{document.removeEventListener('fullscreenchange',sync);document.removeEventListener('keydown',escape);window.visualViewport?.removeEventListener('resize',viewport);window.visualViewport?.removeEventListener('scroll',viewport);window.removeEventListener('resize',viewport);void exitTerminalFullscreen(element).catch(()=>{});};
 },[]);
 useEffect(()=>{if(!active){void exitTerminalFullscreen(shellRef.current).catch(()=>{});setExpanded(false);}},[active]);
 useSSHSession(id);
 useShellPresence(id);
 useEffect(()=>{
  if(!id||!ref.current)return;
  const terminal=new Terminal({fontSize:tools.fontRef.current,theme:{background:'#07111d'},cursorBlink:true}),fit=new FitAddon(),controller=new AbortController();
  terminalRef.current=terminal;setCanPaste(true);fitRef.current=fit;terminal.loadAddon(fit);terminal.open(ref.current);fit.fit();
  const releaseTouchSelection=tools.attach(ref.current,terminal);
  let resizeFrame=0;
  let stopped=false,closed=false,probing=false,timer:ReturnType<typeof setTimeout>|undefined,failures=0,lastSize='';
  let outputRequest:AbortController|undefined,expiresAt=0;
  const endpoint=`/ssh/session/${id}`;
  const unavailable=(status:number)=>[401,403,404,409].includes(status);
  const disableInput=()=>{queue.stop();terminal.options.disableStdin=true;setCanPaste(false);};
  const endSession=()=>{closed=true;disableInput();setInputError('');clearTimeout(timer);outputRequest?.abort();};
  setInputError('');setResuming(false);
  const queue=shellInputQueue(chunk=>api(endpoint,{method:'POST',body:JSON.stringify({input:chunk}),signal:controller.signal}),error=>{
   if(stopped||closed)return;
   disableInput();
   if(unavailable(error.status)){endSession();setError(error.message);return;}
   setInputError(error.message);
  });
  resumeTyping.current=async()=>{
   if(stopped||closed||probing)return;
   probing=true;setResuming(true);
   try{
    // Verify the existing SSH channel without sending any terminal bytes.
    await api(endpoint,{method:'POST',body:JSON.stringify({presence:'active'}),signal:controller.signal});
    if(stopped||closed||!queue.resume())return;
    terminal.options.disableStdin=false;setCanPaste(true);setInputError('');
    if(activeRef.current)terminal.focus();
   }catch(error:any){
    if(stopped||closed)return;
    if(unavailable(error.status)){endSession();setError(error.message);}
    else setInputError(error.message);
   }finally{probing=false;if(!stopped)setResuming(false);}
  };
  const resize=()=>{if(!ref.current?.offsetWidth||!ref.current?.offsetHeight||stopped)return;const dimensions=fit.proposeDimensions();if(!dimensions||dimensions.cols<2||dimensions.rows<1)return;if(terminal.cols!==dimensions.cols||terminal.rows!==dimensions.rows)terminal.resize(dimensions.cols,dimensions.rows);const size=`${terminal.cols}:${terminal.rows}`;if(size===lastSize)return;lastSize=size;api(`/ssh/session/${id}`,{method:'POST',body:JSON.stringify({cols:terminal.cols,rows:terminal.rows}),signal:controller.signal}).catch(()=>{});};
  resizeTerminal.current=resize;
  const observer=new ResizeObserver(()=>{if(resizeFrame)cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(resize)});observer.observe(ref.current);
  const input=terminal.onData(text=>queue.push(text));
  const stream=async()=>{
   if(stopped||closed||outputRequest)return;
   clearTimeout(timer);timer=undefined;
   const request=new AbortController();outputRequest=request;
   // The server ends each read after 15 seconds, including on an idle PTY.
   expiresAt=Date.now()+OUTPUT_READ_TIMEOUT_MS;
   const watchdog=setTimeout(()=>request.abort(),OUTPUT_READ_TIMEOUT_MS);
   try{
    const response=await api<Response>(endpoint+'/output',{signal:request.signal},undefined,true);
    if(stopped||closed)return;
    setError('');
    await readShellOutput(response,frame=>{
     if(stopped||closed)return;
     terminal.write(frame.output);
     if(frame.closed){
      if(updateTab&&frame.updateResult)setResult(frame.updateResult);
      closed=true;disableInput();setInputError('');terminal.write('\r\n[SSH session closed]');
     }
    });
    failures=0;
   }catch(error:any){
    if(stopped||closed)return;
    if(unavailable(error.status)){endSession();setError(error.message);return;}
    setError('Reconnecting terminal output…');failures++;
   }finally{clearTimeout(watchdog);outputRequest=undefined;}
   if(stopped||closed)return;
   const retryDelay=failures&&!request.signal.aborted?Math.min(30000,1000*2**Math.min(failures,5)):0;
   timer=setTimeout(stream,retryDelay);
  };
  const wake=()=>{
   if(document.hidden||stopped||closed)return;
   if(outputRequest){if(Date.now()>=expiresAt)outputRequest.abort();}
   else void stream();
  };
  window.addEventListener('online',wake);window.addEventListener('pageshow',wake);document.addEventListener('visibilitychange',wake);
  void stream();resize();
  return()=>{stopped=true;resumeTyping.current=null;resizeTerminal.current=null;releaseTouchSelection();queue.stop();controller.abort();outputRequest?.abort();clearTimeout(timer);window.removeEventListener('online',wake);window.removeEventListener('pageshow',wake);document.removeEventListener('visibilitychange',wake);observer.disconnect();if(resizeFrame)cancelAnimationFrame(resizeFrame);input.dispose();terminal.dispose();terminalRef.current=null;fitRef.current=null;};
 },[id]);
 useEffect(()=>{if(active&&id){requestAnimationFrame(()=>{fitRef.current?.fit();terminalRef.current?.focus()})}},[active,id]);
 return <div ref={shellRef} className={`ssh-shell${expanded?' terminal-expanded':''}`}>{!id?<SSHLogin target={target} host={host} onConnected={r=>setId(r.id)}/>:<><div className="shell-session-toolbar"><div className="shell-session-heading"><TerminalIcon size={21}/><span><b>{name||target}</b><small>{target} · SSH</small></span></div><div className="header-actions">{onUpdateSession&&/^(vm|lxc):/.test(target)&&<button type="button" className="btn text-action shell-update-label" aria-label="Guest OS updates" title="Check guest OS updates (Debian or Ubuntu)" disabled={!active||!canPaste||checking} onClick={async()=>{setChecking(true);setError('');try{const r=await api('/ssh/session/'+encodeURIComponent(id)+'/guest-update',{method:'POST'});onUpdateSession(r.id)}catch(e:any){setError(e.message)}finally{setChecking(false)}}}>OS Update</button>}{tools.buttons}<button className="icon-btn" type="button" aria-label={expanded?'Exit fullscreen terminal':'Fullscreen terminal'} title={expanded?'Exit fullscreen':'Fullscreen'} aria-pressed={expanded} onClick={async()=>{try{setExpanded(await fullscreenTerminal(shellRef.current))}catch(e:any){setError(e.message||'Fullscreen unavailable')}}}>{expanded?<Minimize size={18}/>:<Maximize size={18}/>}</button></div></div>{inputError&&<div className="shell-input-recovery" role="alert"><span>{inputError}</span><span>The last input may have reached the guest. Check the terminal before resuming.</span><button type="button" className="btn secondary" disabled={resuming||!active} onClick={()=>void resumeTyping.current?.()}>Resume typing</button></div>}<div ref={ref} className="ssh-terminal" onContextMenu={tools.onContextMenu}/></>}{tools.dialog}{error&&<p className="error">{error}</p>}<Modal open={!!result&&active&&!restartOpen} title="OS update successful" onClose={()=>setResult(null)}>{result&&<><p><strong>{name}</strong></p><p>Current OS version: <b>{result.osVersion}</b></p>{result.rebootRequired&&<p>A guest reboot is required.</p>}<div className="modal-actions">{result.rebootRequired&&guest&&<button type="button" className="btn primary" onClick={()=>setRestartOpen(true)}>{guest[1]==='vm'?'Restart VM':'Restart CT'}</button>}<button type="button" className="btn secondary" onClick={()=>onDisconnect?.()}>Close update shell</button></div></>}</Modal>{restartOpen&&guest&&<GuestRestartDialog reason="update" node={guest[2]} id={guest[3]} kind={guest[1]==='vm'?'vm':'lxc'} name={name?.replace(/ · OS updates$/,'')||target} onClose={()=>setRestartOpen(false)} onComplete={()=>{setRestartOpen(false);setResult(null);onDisconnect?.()}}/>}</div>;
}
