import {useEffect,useRef,useState} from 'react';
import {Card} from './UI';
import {Shield,Download} from 'lucide-react';
import {readBrowserCertificate} from '../browser-certificate';
export default function BrowserCertificateSetup(){
 const [certificate,setCertificate]=useState<{pem:string;fingerprint:string|null}|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const request=useRef<AbortController|null>(null);
 useEffect(()=>()=>{request.current?.abort();request.current=null},[]);
 const check=async()=>{if(busy)return;const controller=new AbortController(),view=window;request.current=controller;setBusy(true);setError('');setCertificate(null);const timer=view.setTimeout(()=>controller.abort(),8000);
 try{const result=await readBrowserCertificate(controller.signal);if(!controller.signal.aborted)setCertificate(result)}catch(e:any){if(request.current===controller)setError(controller.signal.aborted?'Certificate request timed out. Try again.':e.message)}finally{view.clearTimeout(timer);if(request.current===controller){setBusy(false);request.current=null}}};
 const download=()=>{if(!certificate)return;const url=URL.createObjectURL(new Blob([certificate.pem],{type:'application/x-x509-ca-cert'})),a=document.createElement('a');a.href=url;a.download='i-clusters-root.crt';a.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000)};
 return <Card className="settings-overview-card security-settings-card"><div className="settings-card-heading"><span><Shield size={23}/></span><div><h2>Browser Certificate Setup</h2><p>Trust this installation once on each device.</p></div></div>
 <p>For LAN HTTPS, install the public root certificate in your device trust store. Normal server-certificate renewals then work without repeated warnings while the same root is retained.</p>
 <p>Browsers control certificate warnings. i-Clusters cannot accept them automatically or confirm this device trusts the certificate. A domain with a publicly trusted certificate needs no manual root installation.</p>
 <button type="button" className="btn secondary" disabled={busy||window.location.protocol!=='https:'} aria-busy={busy} onClick={()=>void check()}>Check Local Certificate</button>
 {window.location.protocol!=='https:'&&<p role="status">Open the HTTPS address before downloading a certificate.</p>}
 {error&&<p role="alert" className="error">{error}</p>}
 {certificate&&<>{certificate.fingerprint?<><p>Compare this SHA-256 fingerprint with the server before trusting the certificate.</p><code style={{display:'block',overflowWrap:'anywhere'}} translate="no">{certificate.fingerprint}</code></>:<p>Browser hashing is unavailable. Compare the downloaded certificate’s SHA-256 fingerprint with the server using your certificate tools.</p>}<button type="button" className="btn secondary" onClick={download}><Download size={16}/>Download Public Certificate</button></>}
 <details><summary>Verify on the server</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}} translate="no"><code>{'sudo iclusters certificate > iclusters-root.crt\nopenssl x509 -in iclusters-root.crt -noout -fingerprint -sha256'}</code></pre><p>Use a trusted channel to compare fingerprints. Install only the public root from your own server. Never distribute private keys.</p></details>
 <details><summary>Device installation instructions</summary><ul>
 <li>Windows: open the certificate, choose Install Certificate, Current User, then Trusted Root Certification Authorities. Restart the browser.</li>
 <li>iPhone / iPad: install the downloaded profile in Settings, then enable full trust under General, About, Certificate Trust Settings.</li>
 <li>Android: open Settings, Security, Encryption and credentials, then Install a CA certificate. Menu names vary by device and browser.</li>
 <li>macOS: import into Keychain Access, open the certificate trust settings and explicitly trust it for SSL. Firefox may require an Authorities import.</li>
 </ul></details><small className="settings-note">Keep the controller address stable and retain the caddy_data volume. Replacing the root requires trusting the new certificate on each device. Public-domain deployments may not have a local certificate.</small>
 </Card>;
}
