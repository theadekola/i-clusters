import {documentation} from '../documentation';
import {translate} from '../i18n/locale';
import {Shield,ExternalLink} from 'lucide-react';
import {Card} from './UI';
function Block({title,detail,icon:Icon,children,className=''}:any){return <Card className={`settings-overview-card security-settings-card ${className}`}><div className="settings-card-heading"><span><Icon size={23}/></span><div><h2>{title}</h2><p>{detail}</p></div></div>{children}</Card>}
const fact=(label:string,value:any)=><div className="settings-fact" key={label}><span>{label}</span><b>{value??'Not reported'}</b></div>;
export function TransportSettings({search}:{search:string}){
 const visible=(text:string)=>(text+' '+translate(text)).toLowerCase().includes(search.toLowerCase());
 const https=window.location.protocol==='https:';
 return <>
 {visible('Network Security HTTPS TLS firewall ports proxy fail2ban IP')&&<Block title="Network Security" detail="Browser transport and deployment-managed protections." icon={Shield}>{fact('This browser connection',https?'HTTPS':'HTTP (unencrypted)')}{fact('HTTPS redirect','Managed by reverse proxy')}{fact('Allowed ports / IP whitelist','Managed by host or proxy')}{fact('Firewall / Fail2Ban','Not inspected')}{fact('Trusted proxies','Configured by deployment')}<small className="settings-note">HTTPS here reports the current URL scheme, not certificate validity or backend transport. Configure certificates, redirects, firewall rules and TRUST_PROXY on the controller host. This page does not change network access.</small><a className="settings-card-link" href={documentation.networkSecurity} target="_blank" rel="noopener noreferrer">Security Documentation<ExternalLink size={14}/></a></Block>}
 </>;
}
