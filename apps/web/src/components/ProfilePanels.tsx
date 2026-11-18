import {useRef,useState, type ReactNode,type ChangeEvent} from 'react';
import {Box,Camera,Check,Crown,Layers,Monitor,Pencil,Server,ShieldCheck,UserRound} from 'lucide-react';
import {api} from '../api';
import {useApi} from '../hooks';

const PHOTO_SIZE=128;
async function thumbnail(file:File) {
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>8*1024*1024)
    throw Error('Choose a JPEG, PNG or WebP image up to 8 MB.');
  const source=URL.createObjectURL(file);
  try{
    const img=new Image();img.src=source;await img.decode();
    const canvas=document.createElement('canvas');canvas.width=canvas.height=PHOTO_SIZE;
    const ctx=canvas.getContext('2d');
    if(!ctx||!img.naturalWidth||!img.naturalHeight)throw Error('Could not read this picture.');
    const side=Math.min(img.naturalWidth,img.naturalHeight);
    ctx.drawImage(img,(img.naturalWidth-side)/2,(img.naturalHeight-side)/2,side,side,0,0,PHOTO_SIZE,PHOTO_SIZE);
    const bytes=ctx.getImageData(0,0,PHOTO_SIZE,PHOTO_SIZE).data;
    let binary='';
    for(let i=0;i<bytes.length;i+=4096)binary+=String.fromCharCode(...bytes.subarray(i,i+4096));
    return {preview:canvas.toDataURL('image/png'),pixels:btoa(binary)};
  }finally{URL.revokeObjectURL(source)}
}

export function SavedPicture({id,version,size,fallback=null}:{id:string;version:string;size?:number;fallback?:ReactNode}){
  const live=useApi<{image:string}|null>('/account/profile-picture/'+encodeURIComponent(id)+'?v='+encodeURIComponent(version),null,0);
  return live.data?.image?<img className="saved-account-picture" width={size} height={size} alt="" src={live.data.image}/>:fallback;
}

export function ProfileForm({user,self,role,onSaved}:{user:any;self:boolean;role:string;onSaved:(patch:any)=>void}){
  const stored=user.profile||{};
  const current={name:user.name||'',username:user.username||'',contactEmail:stored.contactEmail??(user.email?.includes('@')?user.email:''),timeZone:stored.timeZone||(self?(Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'):''),bio:stored.bio||''};
  const [draft,setDraft]=useState<typeof current|null>(null),[revision,setRevision]=useState('');
  const [picture,setPicture]=useState<Awaited<ReturnType<typeof thumbnail>>|null>(null);
  const [reading,setReading]=useState(false),[saving,setSaving]=useState(false);
  const [message,setMessage]=useState(''),[error,setError]=useState('');
  const input=useRef<HTMLInputElement>(null);
  const editing=self&&draft!==null,values=draft??current,busy=reading||saving;
  const timeZones=[...new Set(['UTC', values.timeZone, Intl.DateTimeFormat().resolvedOptions().timeZone, ...((Intl as any).supportedValuesOf?.('timeZone')||[])].filter(Boolean))].sort();
  function edit(){setDraft({...current});setRevision(stored.revision||'');setError('');setMessage('')}
  function discard(){setDraft(null);setPicture(null);setError('');setMessage('')}
  function update(key:keyof typeof current,value:string){setDraft({...values,[key]:value});setError('')}
  async function upload(event:ChangeEvent<HTMLInputElement>){
    const file=event.target.files?.[0];event.target.value='';if(!file)return;
    setReading(true);setError('');
    try{setPicture(await thumbnail(file))}catch(e){setError(e instanceof Error?e.message:'Could not read this picture.')}finally{setReading(false)}
  }
  const dirty=picture!==null||Object.keys(current).some(key=>values[key as keyof typeof current]!==current[key as keyof typeof current]);
  async function save(event:React.FormEvent){
    event.preventDefault();if(!editing||!dirty||busy)return;setSaving(true);setError('');
    try{
      const result=await api('/account/profile',{method:'PUT',body:JSON.stringify({...draft,revision,...(picture?{picturePixels:picture.pixels}:{})})});
      onSaved(result);setDraft(null);setPicture(null);setMessage('Profile saved.');
    }catch(e:any){setError(e.message)}finally{setSaving(false)}
  }
  return <form className="profile-section profile-editor" onSubmit={save}>
    <header className="account-section-title"><UserRound/><div><h3>Personal Information</h3><p>Update your name, username and profile details.</p></div></header>
    <div className="profile-fields">
      <label>Full name<input required maxLength={200} readOnly={!editing} disabled={busy} value={values.name} onChange={e=>update('name',e.target.value)}/></label>
      <label>Contact email<input type="email" maxLength={254} readOnly={!editing} disabled={busy} value={values.contactEmail} onChange={e=>update('contactEmail',e.target.value)}/></label>
      <label>Username<input required autoCapitalize="none" autoComplete="username" pattern="[a-zA-Z0-9][a-zA-Z0-9_.\-]{2,63}" minLength={3} maxLength={64} readOnly={!editing} disabled={busy} value={values.username} onChange={e=>update('username',e.target.value)}/></label>
      <label>Time zone<select required disabled={!editing||busy} value={values.timeZone} onChange={e=>update('timeZone',e.target.value)}>{!values.timeZone&&<option value="">Choose a time zone</option>}{timeZones.map(zone=><option key={zone} value={zone}>{zone.replace(/_/g,' ')}</option>)}</select></label>
      <label>Role<input readOnly value={role}/></label>
      {self&&<div className="profile-photo-field"><span>Profile picture</span><div>
        <span className="profile-photo-preview"><UserRound/>{picture?<img src={picture.preview} alt="Selected profile picture"/>:stored.pictureVersion&&<SavedPicture id={user.id} version={stored.pictureVersion}/>}</span>
        <button type="button" className="btn secondary" disabled={busy} onClick={()=>{if(!editing)edit();input.current?.click()}}><Camera size={16}/>Upload profile picture</button>
        <input ref={input} type="file" hidden accept="image/jpeg,image/png,image/webp" aria-label="Choose profile picture" onChange={upload}/>
      </div></div>}
      <label className="profile-bio">Bio<textarea maxLength={300} rows={3} readOnly={!editing} disabled={busy} value={values.bio} onChange={e=>update('bio',e.target.value)}/><small>{values.bio.length} / 300</small></label>
    </div>
    {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
    {self&&<div className="profile-actions">{editing?<><button type="button" className="btn secondary" disabled={busy} onClick={discard}>Discard</button><button className="btn primary" disabled={busy||!dirty}><Check size={16}/>Save</button></>:<button type="button" className="btn primary" onClick={edit}><Pencil size={16}/>Edit profile</button>}</div>}
  </form>
}

function InventoryCards({keys}:{keys?:string[]}){
  const live=useApi<any>('/proxmox',null);
  return <>{([{label:'Nodes',key:'cluster.view',field:'nodes',status:'online',caption:'Online',Icon:Server},{label:'VMs',key:'vm.view',field:'vms',status:'running',caption:'Running',Icon:Monitor},{label:'Containers',key:'containers.view',field:'lxc',status:'running',caption:'Running',Icon:Box}]).map(({label,key,field,status,caption,Icon})=>{
    const allowed=!keys||keys.includes(key),rows=live.data?.[field];
    const known=allowed&&!live.error&&live.data?.resourceInventoryComplete!==false&&Array.isArray(rows);
    return <div key={field}><Icon/><strong>{known?rows.filter((r:any)=>r.status===status).length:'—'} {label}</strong><small>{!allowed?'Restricted':known?caption:live.loading?'Loading':'Not reported'}</small></div>
  })}</>
}

export function AccountOverview({user,self,role,onPermissions}:{user:any;self:boolean;role:string;onPermissions:()=>void}){
  return <section className="profile-section"><header className="account-section-title"><Layers/><div><h3>Account Overview</h3><p>Account access and resources in the selected cluster.</p></div></header>
    <div className="profile-stats account-overview-cards"><div><Crown/><strong>{role}</strong><small>Assigned Role</small></div>
    {self?<InventoryCards keys={user.permissionKeys}/>:<div><ShieldCheck/><strong>{user.status}</strong><small>Account status</small></div>}</div>
    <button className="account-text-button" onClick={onPermissions}>View permissions →</button>
  </section>
}
