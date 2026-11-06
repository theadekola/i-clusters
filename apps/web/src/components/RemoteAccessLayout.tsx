import {useState} from 'react';
import {Camera,Copy,ExternalLink,Monitor,ShieldCheck,Smartphone} from 'lucide-react';
import {dashboardLink} from '../mobile-access';
import AccessQR from './AccessQR';
import './remote-access.css';
export default function RemoteAccessLayout(){
 const address=window.location.origin,[copy,setCopy]=useState('');
 const url=dashboardLink(address);
 const copyLink=async()=>{try{await navigator.clipboard.writeText(url);setCopy('Dashboard link copied.')}catch{setCopy('Copy unavailable. Select the dashboard address to copy it.')}};
 return <div className="remote-access-grid">
  <section className="card mobile-access-card" aria-labelledby="mobile-access-title">
   <div className="access-brand"><img src="/assets/iclusters-192.png" alt=""/><strong>i-Clusters</strong><a href={url||undefined} className="btn secondary small" aria-disabled={!url}>Open in Browser <ExternalLink size={16}/></a></div>
   <h2 id="mobile-access-title">Access Your Dashboard<br/>on Mobile</h2><p>Scan with your phone’s camera to open i-Clusters in your mobile browser.</p>
   <div className="dashboard-qr-frame">{url?<AccessQR value={url} label="Scan to open the i-Clusters dashboard on mobile"/>:<p>A reachable HTTPS installation address is required.</p>}</div>
   <p className="muted">Dashboard address generated automatically for this installation. The QR code does not verify that your phone can reach it.</p>
   {!url&&<p role="alert">Open this installation using its reachable HTTPS address to generate the mobile QR code.</p>}
   <div className="access-link"><code>{url||'HTTPS address required'}</code><button className="icon-btn" aria-label="Copy dashboard link" disabled={!url} onClick={copyLink}><Copy size={18}/></button></div>{copy&&<p role="status">{copy}</p>}
   <ol className="mobile-scan-steps"><li><Camera/><span>Open your camera</span></li><li><Smartphone/><span>Scan the QR code</span></li><li><Monitor/><span>Sign in and install</span></li></ol>
   {url&&<a className="btn primary access-open" href={url}><ExternalLink size={18}/>Open Dashboard on This Device</a>}
   <div className="access-note"><ShieldCheck/><div><strong>Your usual sign-in still applies</strong><p>Connect to the same network first. Use an address reachable from your phone with a trusted HTTPS certificate.</p></div></div>
   <p><a href="/connection-check.html" target="_blank" rel="noopener">Check connection and HTTPS trust</a></p>
   <details><summary>Install on Android or iPhone</summary><p>Android: open the scanned link, then tap Install i-Clusters when offered. You can also use your browser’s Install app or Add to Home screen menu.</p><p>iPhone: open in Safari, tap Share, then Add to Home Screen. Keep Open as Web App enabled when shown, then tap Add.</p></details>
  </section>
 </div>;
}
