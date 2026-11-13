import {attachTerminalTouchSelection} from '../terminal-touch';
import {readShellOutput,shellInputQueue} from '../shell-stream';
import {useShellPresence,useSSHSession} from '../ssh-session';
import {fullscreenTerminal,exitTerminalFullscreen,copyTerminalSelection} from '../ssh-transfer';
import {useEffect,useRef,useState} from 'react';
import {Terminal} from '@xterm/xterm';
import {FitAddon} from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import './ssh-terminal.css';
import {api} from '../api';
import {Modal} from './UI';
import {Maximize,Minimize,Type,Copy,ClipboardPaste,Terminal as TerminalIcon} from 'lucide-react';
import GuestRestartDialog from './GuestRestartDialog';
import {SSHLogin} from './SSHAccess';
const OUTPUT_READ_TIMEOUT_MS=20000;

export default function SSHTerminal({target,host,sessionId,updateTab=false,onUpdateSession,onDisconnect,active=true,name}:{target:string;updateTab?:boolean;onUpdateSession?:(id:string)=>void;host?:string;sessionId?:string;active?:boolean;name?:string;onDisconnect?:()=>void}){
 const [result,setResult]=useState<{osVersion:string;rebootRequired:boolean}|null>(null);
 const [restartOpen,setRestartOpen]=useState(false);
 const guest=/^(vm|lxc):([^:]+):(\d+)$/.exec(target);
 const [fontSize,setFontSize]=useState(()=>{try{const n=Number(localStorage.getItem('iclusters-shell-font'));return Number.isInteger(n)&&n>0?Math.min(15,Math.max(10,n)):12}catch{return 12}});
 const resizeTerminal=useRef<null|(()=>void)>(null);
 const fontRef=useRef(fontSize);fontRef.current=fontSize;
 const updateFont=(n:number)=>{setFontSize(n);try{localStorage.setItem('iclusters-shell-font',String(n))}catch{}};
 useEffect(()=>{if(terminalRef.current){terminalRef.current.options.fontSize=fontSize;resizeTerminal.current?.()}},[fontSize]);
 const [checking,setChecking]=useState(false);
 const [inputError,setInputError]=useState(''),[resuming,setResuming]=useState(false);
 const resumeTyping=useRef<null|(()=>Promise<void>)>(null);
 const [expanded,setExpanded]=useState(false);
 const [id,setId]=useState(sessionId||''),[error,setError]=useState(''),ref=useRef<HTMLDivElement>(null),terminalRef=useRef<Terminal|null>(null),fitRef=useRef<FitAddon|null>(null),shellRef=useRef<HTMLDivElement>(null);
 const [clipboard,setClipboard]=useState<null|'actions'|'copy'|'paste'>(null),[clipboardText,setClipboardText]=useState(''),[clipboardBusy,setClipboardBusy]=useState(false),[notice,setNotice]=useState(''),[canPaste,setCanPaste]=useState(false);
 const clipboardField=useRef<HTMLTextAreaElement>(null),activeRef=useRef(active),clipboardGeneration=useRef(0),clipboardActions=useRef({copy:()=>{},paste:()=>{}});activeRef.current=active;
 const current=(terminal:Terminal,generation:number)=>activeRef.current&&terminalRef.current===terminal&&clipboardGeneration.current===generation;
 const copy=async()=>{const terminal=terminalRef.current;if(!terminal||!activeRef.current||clipboardBusy)return;const text=terminal.getSelection();if(!text){setNotice('Select terminal text first, or use Select All.');return;}const generation=clipboardGeneration.current;setClipboardBusy(true);setNotice('');try{await copyTerminalSelection(text);if(current(terminal,generation)){setClipboard(null);setNotice('Terminal text copied.')}}catch{if(current(terminal,generation)){setClipboardText(text);setClipboard('copy')}}finally{setClipboardBusy(false)}};
 const paste=async()=>{const terminal=terminalRef.current;if(!terminal||!activeRef.current||terminal.options.disableStdin||clipboardBusy)return;const generation=clipboardGeneration.current;setClipboardBusy(true);setNotice('');try{if(!navigator.clipboard?.readText)throw Error('Clipboard unavailable');const text=await navigator.clipboard.readText();if(current(terminal,generation)&&!terminal.options.disableStdin){terminal.paste(text);setClipboard(null);terminal.focus();}}catch{if(current(terminal,generation)&&!terminal.options.disableStdin){setClipboardText('');setClipboard('paste')}}finally{setClipboardBusy(false)}};
 const selectAll=()=>{terminalRef.current?.selectAll();};
 clipboardActions.current={copy:()=>{void copy()},paste:()=>{void paste()}};
 useEffect(()=>{clipboardGeneration.current++;setClipboard(null);setClipboardText('');setNotice('');},[active,id]);
 useEffect(()=>{if(clipboard==='copy'){clipboardField.current?.focus();clipboardField.current?.select()}else if(clipboard==='paste')clipboardField.current?.focus()},[clipboard]);
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
  const terminal=new Terminal({fontSize:fontRef.current,theme:{background:'#07111d'},cursorBlink:true}),fit=new FitAddon(),controller=new AbortController();
  terminalRef.current=terminal;setCanPaste(true);fitRef.current=fit;terminal.loadAddon(fit);terminal.open(ref.current);fit.fit();
  terminal.attachCustomKeyEventHandler?.(event=>{
   if(event.type!=='keydown'||!activeRef.current||event.altKey)return true;
   const key=event.key.toLowerCase(),shortcut=event.ctrlKey&&event.shiftKey||event.metaKey&&!event.ctrlKey;
   if(shortcut&&(key==='v'||key==='c'&&!!terminal.getSelection())){event.preventDefault();key==='c'?clipboardActions.current.copy():clipboardActions.current.paste();return false}return true;
  });
  const releaseTouchSelection=attachTerminalTouchSelection(ref.current,terminal);
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
 return <div ref={shellRef} className={`ssh-shell${expanded?' terminal-expanded':''}`}>{!id?<SSHLogin target={target} host={host} onConnected={r=>setId(r.id)}/>:<><div className="shell-session-toolbar"><div className="shell-session-heading"><TerminalIcon size={21}/><span><b>{name||target}</b><small>{target} · SSH</small></span></div><div className="header-actions">{onUpdateSession&&/^(vm|lxc):/.test(target)&&<button type="button" className="btn text-action shell-update-label" aria-label="Guest OS updates" title="Check guest OS updates (Debian or Ubuntu)" disabled={!active||!canPaste||checking} onClick={async()=>{setChecking(true);setError('');try{const r=await api('/ssh/session/'+encodeURIComponent(id)+'/guest-update',{method:'POST'});onUpdateSession(r.id)}catch(e:any){setError(e.message)}finally{setChecking(false)}}}>OS Update</button>}<label className="icon-btn shell-font-control" title="Font size"><Type size={17} aria-hidden="true"/><select aria-label="Font size" value={fontSize} onChange={e=>updateFont(Number(e.target.value))}>{[10,11,12,13,14,15].map(n=><option value={n} key={n}>{n}</option>)}</select></label><button type="button" className="icon-btn shell-clipboard-button" disabled={!active||clipboardBusy} onMouseDown={e=>e.preventDefault()} onClick={copy} aria-label="Copy selected text" title="Copy selected text (Ctrl+Shift+C or Cmd+C)"><Copy size={18}/></button><button type="button" className="icon-btn shell-clipboard-button" disabled={!active||!canPaste||clipboardBusy} onClick={paste} aria-label="Paste text" title="Paste text (Ctrl+Shift+V or Cmd+V)"><ClipboardPaste size={18}/></button><button className="icon-btn" type="button" aria-label={expanded?'Exit fullscreen terminal':'Fullscreen terminal'} title={expanded?'Exit fullscreen':'Fullscreen'} aria-pressed={expanded} onClick={async()=>{try{setExpanded(await fullscreenTerminal(shellRef.current))}catch(e:any){setError(e.message||'Fullscreen unavailable')}}}>{expanded?<Minimize size={18}/>:<Maximize size={18}/>}</button></div></div>{inputError&&<div className="shell-input-recovery" role="alert"><span>{inputError}</span><span>The last input may have reached the guest. Check the terminal before resuming.</span><button type="button" className="btn secondary" disabled={resuming||!active} onClick={()=>void resumeTyping.current?.()}>Resume typing</button></div>}<div ref={ref} className="ssh-terminal" onContextMenu={event=>{if(event.defaultPrevented||!active||(event.target as HTMLElement).closest('.terminal-selection'))return;event.preventDefault();setClipboard('actions')}}/><small className="shell-clipboard-help">Select text with your mouse, or hold on mobile. Copy: Ctrl+Shift+C / Cmd+C. Paste: Ctrl+Shift+V / Cmd+V.</small></>}{notice&&<p role="status" className="shell-clipboard-notice">{notice}</p>}{error&&<p className="error">{error}</p>}<Modal open={!!result&&active&&!restartOpen} title="OS update successful" onClose={()=>setResult(null)}>{result&&<><p><strong>{name}</strong></p><p>Current OS version: <b>{result.osVersion}</b></p>{result.rebootRequired&&<p>A guest reboot is required.</p>}<div className="modal-actions">{result.rebootRequired&&guest&&<button type="button" className="btn primary" onClick={()=>setRestartOpen(true)}>{guest[1]==='vm'?'Restart VM':'Restart CT'}</button>}<button type="button" className="btn secondary" onClick={()=>onDisconnect?.()}>Close update shell</button></div></>}</Modal>{restartOpen&&guest&&<GuestRestartDialog reason="update" node={guest[2]} id={guest[3]} kind={guest[1]==='vm'?'vm':'lxc'} name={name?.replace(/ · OS updates$/,'')||target} onClose={()=>setRestartOpen(false)} onComplete={()=>{setRestartOpen(false);setResult(null);onDisconnect?.()}}/>}<Modal open={!!clipboard&&active} title={clipboard==='copy'?'Copy Terminal Text':clipboard==='paste'?'Paste into Terminal':'Terminal Text Actions'} onClose={()=>{setClipboard(null);setClipboardText('')}}>{clipboard==='actions'?<div className="configuration-actions"><button type="button" className="btn secondary" aria-busy={clipboardBusy} disabled={clipboardBusy} onClick={copy}>Copy</button><button type="button" className="btn secondary" disabled={!canPaste||clipboardBusy} onClick={paste}>Paste</button><button type="button" className="btn secondary" onClick={()=>{selectAll();setClipboard(null)}}>Select All</button><p>Select terminal text first to copy a portion of the output.</p></div>:<form className="shell-clipboard-form" onSubmit={event=>{event.preventDefault();const terminal=terminalRef.current;if(clipboard!=='paste'||!active||!terminal||terminal.options.disableStdin)return;terminal.paste(clipboardText);setClipboardText('');setClipboard(null);terminal.focus()}}><p>{clipboard==='copy'?'Clipboard access is blocked. Copy the selected text below with your keyboard or mobile text menu.':'Clipboard access is blocked. Paste your text below, then choose Insert into Terminal.'}</p><label>{clipboard==='copy'?'Selected terminal text':'Text to paste'}<textarea ref={clipboardField} aria-label={clipboard==='copy'?'Selected terminal text':'Text to paste'} value={clipboardText} readOnly={clipboard==='copy'} onChange={event=>setClipboardText(event.target.value)} rows={8} spellCheck={false}/></label>{clipboard==='paste'&&<button className="btn primary" disabled={!clipboardText||!canPaste}>Insert into Terminal</button>}</form>}</Modal></div>;
}
