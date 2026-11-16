const readingNames:Record<string,string>={os:'Guest OS',interfaces:'IP address',history:'Performance history',status:'Power state',snapshots:'Snapshots',config:'VM configuration'};

export function vmReadingIssues(errors:string[],power?:string){
 const groups=new Map<string,Set<string>>();
 for(const error of errors){
  const match=/^(os|interfaces|history|status|snapshots|config):\s*(.*)$/i.exec(error);
  const field=match?.[1].toLowerCase()||'',cause=match?.[2]||error;
  const agent=field==='os'||field==='interfaces';
  let message='Check the VM and its node in Proxmox, then refresh.';
  if(/\b401\b|authentication failed/i.test(cause))message='Proxmox rejected the saved credentials. Check the Proxmox connection in Settings.';
  else if(/\b403\b|permission|access denied/i.test(cause))message='The Proxmox account cannot read this information. Check its access to this VM.';
  else if(agent&&power==='stopped')message='This reading is available when the VM is running.';
  else if(agent&&/guest agent (?:is )?(?:not configured|disabled|not enabled)|no (?:qemu )?guest agent configured/i.test(cause))message='Guest-agent access is disabled. Enable QEMU Guest Agent in this VM’s Proxmox options.';
  else if(agent&&/guest agent.*(?:not running|not responding|not available|timed out|unreachable)/i.test(cause))message='QEMU Guest Agent did not respond. Check that the service is installed and running inside this VM.';
  else if(/timeout|timed out|unreachable|ECONN|fetch failed/i.test(cause))message='The Proxmox node did not respond. Check the connection and refresh.';
  const fields=groups.get(message)||new Set<string>();
  fields.add(readingNames[field]||'VM details');groups.set(message,fields);
 }
 return Array.from(groups,([message,fields])=>({message,fields:[...fields]}));
}
