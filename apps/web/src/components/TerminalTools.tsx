import {useEffect, useRef, useState, type MouseEvent, type RefObject} from 'react';
import type {Terminal} from '@xterm/xterm';
import {ClipboardPaste, Copy, Type} from 'lucide-react';
import {copyTerminalSelection} from '../ssh-transfer';
import {attachTerminalTouchSelection} from '../terminal-touch';
import {Modal} from './UI';
import './ssh-terminal.css';

export function useTerminalTools(
 terminalRef: RefObject<Terminal | null>, active: boolean, session: string | number,
 canPaste: boolean, resize: RefObject<(() => void) | null>
) {
 const [fontSize,setFontSize]=useState(()=>{
  try {
   const saved=Number(localStorage.getItem('iclusters-shell-font'));
   return Number.isInteger(saved)&&saved>0?Math.min(15,Math.max(10,saved)):12;
  } catch {return 12;}
 });
 const fontRef=useRef(fontSize);
 fontRef.current=fontSize;
 const [clipboard,setClipboard]=useState<null|'actions'|'copy'|'paste'>(null);
 const [clipboardText,setClipboardText]=useState('');
 const [clipboardBusy,setClipboardBusy]=useState(false);
 const [notice,setNotice]=useState('');
 const clipboardField=useRef<HTMLTextAreaElement>(null);
 const activeRef=useRef(active), generation=useRef(0);
 activeRef.current=active;
 const current=(terminal:Terminal,epoch:number)=>activeRef.current&&terminalRef.current===terminal&&generation.current===epoch;

 const closeClipboard=()=>{setClipboard(null);setClipboardText('');};
 const copy=async()=>{
  const terminal=terminalRef.current;
  if(!terminal||!activeRef.current||clipboardBusy)return;
  const text=terminal.getSelection();
  if(!text){setNotice('Select terminal text first, or use Select All.');return;}
  const epoch=generation.current;
  setClipboardBusy(true);setNotice('');
  try {
   await copyTerminalSelection(text);
   if(current(terminal,epoch)){closeClipboard();setNotice('Terminal text copied.');}
  } catch {
   if(current(terminal,epoch)){setClipboardText(text);setClipboard('copy');}
  } finally {setClipboardBusy(false);}
 };
 const paste=async()=>{
  const terminal=terminalRef.current;
  if(!terminal||!activeRef.current||terminal.options.disableStdin||clipboardBusy)return;
  const epoch=generation.current;
  setClipboardBusy(true);setNotice('');
  try {
   if(!navigator.clipboard?.readText)throw Error('Clipboard unavailable');
   const text=await navigator.clipboard.readText();
   if(current(terminal,epoch)&&!terminal.options.disableStdin){terminal.paste(text);closeClipboard();terminal.focus();}
  } catch {
   if(current(terminal,epoch)&&!terminal.options.disableStdin){setClipboardText('');setClipboard('paste');}
  } finally {setClipboardBusy(false);}
 };
 const shortcuts=useRef({copy,paste});
 shortcuts.current={copy,paste};
 const attach=(viewport:HTMLElement,terminal:Terminal)=>{
  terminal.attachCustomKeyEventHandler?.(event=>{
   if(event.type!=='keydown'||!activeRef.current||event.altKey)return true;
   const key=event.key.toLowerCase(),modifier=event.ctrlKey&&event.shiftKey||event.metaKey&&!event.ctrlKey;
   if(!modifier||key!=='v'&&(key!=='c'||!terminal.getSelection()))return true;
   event.preventDefault();
   void (key==='c'?shortcuts.current.copy():shortcuts.current.paste());
   return false;
  });
  return attachTerminalTouchSelection(viewport,terminal);
 };
 const onContextMenu=(event:MouseEvent)=>{
  if(event.defaultPrevented||!active||!terminalRef.current||(event.target as HTMLElement).closest('.terminal-selection'))return;
  event.preventDefault();setClipboard('actions');
 };
 useEffect(()=>{generation.current++;closeClipboard();setNotice('');},[active,session]);
 useEffect(()=>{
  if(clipboard==='copy'){clipboardField.current?.focus();clipboardField.current?.select();}
  else if(clipboard==='paste')clipboardField.current?.focus();
 },[clipboard]);
 useEffect(()=>{
  if(terminalRef.current){terminalRef.current.options.fontSize=fontSize;resize.current?.();}
 },[fontSize,terminalRef,resize]);

 const buttons=<>
  <label className="icon-btn shell-font-control" title="Font size">
   <Type size={17} aria-hidden="true"/>
   <select aria-label="Font size" value={fontSize} onChange={event=>{
    const size=Number(event.target.value);
    setFontSize(size);
    try{localStorage.setItem('iclusters-shell-font',String(size));}catch{}
   }}>{[10,11,12,13,14,15].map(size=><option value={size} key={size}>{size}</option>)}</select>
  </label>
  <button type="button" className="icon-btn shell-clipboard-button" disabled={!active||clipboardBusy}
   onMouseDown={event=>event.preventDefault()} onClick={copy} aria-label="Copy selected text" title="Copy selected text (Ctrl+Shift+C or Cmd+C)"><Copy size={18}/></button>
  <button type="button" className="icon-btn shell-clipboard-button" disabled={!active||!canPaste||clipboardBusy}
   onClick={paste} aria-label="Paste text" title="Paste text (Ctrl+Shift+V or Cmd+V)"><ClipboardPaste size={18}/></button>
 </>;
 const dialog=<><Modal open={!!clipboard&&active} title={clipboard==='copy'?'Copy Terminal Text':clipboard==='paste'?'Paste into Terminal':'Terminal Text Actions'} onClose={closeClipboard}>
  {clipboard==='actions'?<div className="configuration-actions">
   <button type="button" className="btn secondary" aria-busy={clipboardBusy} disabled={clipboardBusy} onClick={copy}>Copy</button>
   <button type="button" className="btn secondary" disabled={!canPaste||clipboardBusy} onClick={paste}>Paste</button>
   <button type="button" className="btn secondary" onClick={()=>{terminalRef.current?.selectAll();closeClipboard();}}>Select All</button>
   <p>Select terminal text first to copy a portion of the output.</p>
  </div>:<form className="shell-clipboard-form" onSubmit={event=>{
   event.preventDefault();
   const terminal=terminalRef.current;
   if(clipboard!=='paste'||!active||!terminal||terminal.options.disableStdin)return;
   terminal.paste(clipboardText);closeClipboard();terminal.focus();
  }}>
   <p>{clipboard==='copy'?'Clipboard access is blocked. Copy the selected text below with your keyboard or mobile text menu.':'Clipboard access is blocked. Paste your text below, then choose Insert into Terminal.'}</p>
   <label>{clipboard==='copy'?'Selected terminal text':'Text to paste'}<textarea ref={clipboardField}
    aria-label={clipboard==='copy'?'Selected terminal text':'Text to paste'} value={clipboardText} readOnly={clipboard==='copy'}
    onChange={event=>setClipboardText(event.target.value)} rows={8} spellCheck={false}/></label>
   {clipboard==='paste'&&<button className="btn primary" disabled={!clipboardText||!canPaste}>Insert into Terminal</button>}
  </form>}
 </Modal>{notice&&<p role="status" className="shell-clipboard-notice">{notice}</p>}</>;
 return {fontRef,attach,buttons,dialog,onContextMenu};
}
