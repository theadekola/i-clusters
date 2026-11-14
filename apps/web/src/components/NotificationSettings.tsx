import {confirmChoice} from '../confirm-choice';
import {isActionCancelled} from '../action-cancellation';
import ReportLoading from './ReportLoading';
import EditableSettingsSection from './EditableSettingsSection';
import NotificationChannelIcon from './NotificationChannelIcon';
import {notificationChannels,notificationNames,channelDefaults} from '../notification-channels';
import ConfigurationDialog from './ConfigurationDialog';
import {useEffect,useState} from 'react';
import {useNotificationPreferences} from './useNotificationPreferences';
import {Link,useSearchParams} from 'react-router-dom';
import {Bell,Send,Clock,Activity,Settings,SlidersHorizontal} from 'lucide-react';
import {useApi} from '../hooks';
import {confirmedApi} from '../api';
import {Card,Badge} from './UI';
const names=notificationNames;
function deliveryPreferences(p:any){
 return {minimumSeverity:String(p.minimumSeverity??'info'),quietHoursEnabled:Boolean(p.quietHoursEnabled),
  quietStart:String(p.quietStart??'22:00'),quietEnd:String(p.quietEnd??'07:00'),deliveryMode:String(p.deliveryMode??'immediate'),
  digestMinutes:Number(p.digestMinutes??60),repeatMinutes:Number(p.repeatMinutes??0)};
}
const fallback=()=>({enabled:true,channels:channelDefaults(),minimumSeverity:'info',notifyResolved:true,notifyDockerUpdates:true});
function Block({title,detail,icon:Icon,children,className=''}:any){return <Card className={`settings-overview-card notification-settings-card ${className}`}><div className="settings-card-heading"><span><Icon size={23}/></span><div><h2>{title}</h2><p>{detail}</p></div></div>{children}</Card>}
function Toggle({label,checked,disabled,onChange}:any){return <label className="settings-toggle"><span><b>{label}</b></span><input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={e=>onChange(e.target.checked)}/><span className="settings-switch-track" aria-hidden="true"/></label>}
export default function NotificationSettings(props:any){return props.owner?<Panel {...props}/>:<Block title="Notifications" detail="Owner-managed delivery settings." icon={Bell}><p>Your role cannot access channel credentials, delivery diagnostics or notification preferences. Ask an i-Clusters owner to manage delivery.</p><Link className="btn secondary" to="/alerts">View Alerts</Link></Block>}
function Panel({editing,busy}:any){
 const [query,setQuery]=useSearchParams();
 useEffect(()=>{const channel=query.get('channel');if(channel&&notificationChannels.includes(channel)){setGuide(channel);const next=new URLSearchParams(query);next.delete('channel');setQuery(next,{replace:true})}},[query]);
 const live=useApi<any>('/notifications',null),[draft,setDraft]=useState<any>(null),[guide,setGuide]=useState(''),[testing,setTesting]=useState(false),[results,setResults]=useState<any[]>([]);
 const data=live.data,available=!!data&&!live.error,channels=data?.channels||[];
 useEffect(()=>{if(!saving){const saved=data?.preferences;setDraft(saved?{...saved,channels:{...channelDefaults(),...saved.channels}}:data?fallback():null);}},[data]);
 const {change,saving,feedback,saveError}=useNotificationPreferences(live,draft,setDraft),locked=saving||busy||!available||!draft;
 const test=async(channel:string)=>{
  if(testing||!available||!await confirmChoice(`Send a test notification to ${names[channel]}? This sends a real message using the saved server configuration.`))return;
  setTesting(true);setResults([]);
  try{await confirmedApi('/notifications/test',{method:'POST',body:JSON.stringify({channel})});setResults([{channel,ok:true,message:'Test delivered'}]);}
  catch(e:any){if(!isActionCancelled(e))setResults([{channel,ok:false,message:e.message||'Delivery failed'}]);}
  finally{setTesting(false);void live.refresh();}
 };
 const history=data?.history||[],sent=data?.lastSent;
 return <>{feedback&&<p role="status">{feedback}</p>}{saveError&&<p className="error" role="alert">{saveError}</p>}{live.error&&<div className="system-settings-feedback" role="alert"><p className="error">{live.error}</p><button type="button" className="btn secondary" aria-busy={live.loading} disabled={live.loading} onClick={()=>live.refresh()}>Retry Notifications</button></div>}{!data&&live.loading&&<p role="status" className="system-settings-feedback"><ReportLoading/></p>}
 <div className="notification-settings-summary"><Block title="Notifications Enabled" detail="Automatic external alert delivery." icon={Bell}><Toggle label="Enable external notifications" checked={draft?.enabled??false} disabled={locked} onChange={(enabled:boolean)=>change({...draft,enabled})}/><small className="settings-note">In-app alerts remain available when external delivery is paused.</small></Block><Block title="Active Channels" detail="Configured and enabled for automatic delivery." icon={Send}><strong>{available?`${(draft?.enabled?channels.filter((c:string)=>draft?.channels[c]).length:0)} / ${channels.length}`:'Unknown'}</strong><small className="settings-note">Configured does not mean delivery has been verified. Use Test.</small></Block><Block title="Stored Deliveries" detail="Retained automatic deliveries and manual tests." icon={Activity}><strong>{available?history.length:'Unknown'}</strong><small className="settings-note">Up to 200 queue records, not a complete 30-day total.</small></Block><Block title="Last Notification" detail="Most recent successful recorded delivery." icon={Clock}><strong className="notification-settings-last">{available?(sent&&!Number.isNaN(Date.parse(sent))?new Date(sent).toLocaleString():'None reported'):'Unknown'}</strong><small className="settings-note">Pending automatic deliveries: {available?data.pending??'Unknown':'Unknown'}</small></Block></div>
 <Block title="Notification Channels" detail="Choose configured channels for automatic alerts." icon={Send} className="notification-settings-channels">{notificationChannels.map(channel=>{const configured=channels.includes(channel);return <div className="notification-settings-channel" key={channel}><span className={`notification-settings-icon ${channel}`}><NotificationChannelIcon channel={channel} size={22}/></span><div><b>{names[channel]}</b><Badge tone={!available?'gray':configured?'blue':'gray'}>{!available?'Unknown':configured?'Configured':'Not configured'}</Badge></div><Toggle label={`Enable ${names[channel]}`} checked={configured&&(draft?.channels[channel]??false)} disabled={locked||!configured} onChange={(enabled:boolean)=>change({...draft,channels:{...draft.channels,[channel]:enabled}})}/><div className="action-row"><button type="button" className="btn secondary" aria-busy={!!(busy)} disabled={!editing||busy} onClick={()=>setGuide(channel)}><Settings size={14}/>Setup</button><button type="button" className="btn secondary" aria-busy={!!(testing||busy)} disabled={!available||!configured||testing||busy} onClick={()=>test(channel)}><Send size={14}/>Test</button></div></div>})}<small className="settings-note">Setup configures the channel. Test sends one message immediately, including during quiet hours.</small>{results.map(r=><p role="status" key={r.channel} className={r.ok?'positive':'error'}>{names[r.channel]}: {r.message}</p>)}{data?.incomplete?.map((text:string)=><p className="error" key={text}>{text}</p>)}</Block>
 <div className="notification-settings-options"><Block title="Notification Events" detail="Supported automatic events from measured alert rules." icon={Bell}><div className="settings-fact"><span>Monitoring alerts</span><b>Active and acknowledged conditions</b></div><Toggle label="Send Docker image update notifications" checked={draft?.notifyDockerUpdates!==false} disabled={locked} onChange={(notifyDockerUpdates:boolean)=>change({...draft,notifyDockerUpdates})}/><Link className="settings-card-link" to="/docker?tab=Updates">Review Docker Updates</Link><Toggle label="Send recovery notifications" checked={draft?.notifyResolved??false} disabled={locked} onChange={(notifyResolved:boolean)=>change({...draft,notifyResolved})}/><Link className="settings-card-link" to="/alerts?tab=Alert%20Rules">Manage Alert Rules</Link><small className="settings-note">Rules evaluate measured CPU, memory and storage conditions and provider failures. Recent failed Proxmox backup tasks produce critical alerts, independently of metric rules. Inspect their logs and resolve the alert after investigation; online storage alone does not verify backup recovery. Successful backup completion, VM lifecycle, login security and arbitrary system events do not currently produce delivery events. Docker image update notifications have their own switch and reach enabled channels regardless of severity filters. Updates are installed only after approval on the Docker Updates page. Connection recoveries always notify every configured, enabled channel while external notifications are enabled, regardless of severity or recovery filters. The recovery switch controls other monitoring recoveries.</small></Block>
 {draft&&<EditableSettingsSection title="Notification Preferences" detail="Delivery preferences for this installation." icon={SlidersHorizontal} allowed={!locked} className="notification-settings-card notification-settings-preferences"
  value={deliveryPreferences(draft)}
  onSave={async value=>{if(!await change({...draft,...value}))throw Error('Notification preferences could not be saved. Try again.')}}>
  {(value,update,editing)=><>
   <label>Minimum Alert Severity<select aria-label="Minimum notification severity" disabled={!editing} value={value.minimumSeverity} onChange={e=>update({minimumSeverity:e.target.value})}><option value="info">Info</option><option value="warning">Warning</option><option value="critical">Critical</option></select></label>
   <label>Delivery timing<select aria-label="Delivery timing" disabled={!editing} value={value.deliveryMode} onChange={e=>update({deliveryMode:e.target.value})}><option value="immediate">Send individually</option><option value="digest">Group into digests</option></select></label>
   {value.deliveryMode==='digest'&&<label>Digest interval<select aria-label="Digest interval" disabled={!editing} value={value.digestMinutes} onChange={e=>update({digestMinutes:Number(e.target.value)})}><option value={15}>15 minutes</option><option value={30}>30 minutes</option><option value={60}>1 hour</option><option value={240}>4 hours</option><option value={1440}>24 hours</option></select></label>}
   <label>Repeat active alerts<select aria-label="Repeat active alerts" disabled={!editing} value={value.repeatMinutes} onChange={e=>update({repeatMinutes:Number(e.target.value)})}><option value={0}>Do not repeat</option><option value={30}>30 minutes</option><option value={60}>1 hour</option><option value={240}>4 hours</option><option value={1440}>24 hours</option></select></label>
   <Toggle label="Quiet hours (UTC)" checked={value.quietHoursEnabled} disabled={!editing} onChange={(quietHoursEnabled:boolean)=>update({quietHoursEnabled})}/>
   {value.quietHoursEnabled&&<div className="notification-quiet-times">
    <label>Start (UTC)<input aria-label="Start (UTC)" type="time" required disabled={!editing} value={value.quietStart} onChange={e=>update({quietStart:e.target.value})}/></label>
    <label>End (UTC)<input aria-label="End (UTC)" type="time" required disabled={!editing} value={value.quietEnd} onChange={e=>update({quietEnd:e.target.value})}/></label>
   </div>}
   <small className="settings-note">Quiet hours pause automatic delivery. Digest intervals start at midnight UTC. Reminders stop when an alert is acknowledged or resolved.</small>
  </>}
 </EditableSettingsSection>}
 </div>
 <ConfigurationDialog service={guide} onClose={()=>setGuide('')} onSaved={()=>{void live.refresh()}}/>
 </>;
}
