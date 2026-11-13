import {clusterBase} from './cluster-context';
import InterfaceMotion from './components/InterfaceMotion';
import {initializeLocale} from './i18n/locale';
import './i18n/language.css';
import InstallPrompt from './components/InstallPrompt';
import './brand-storage';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import PageBoundary from './components/PageBoundary';
import {applyAppearance} from './appearance';
import './styles.css';
import './sizing.css';
import './storage-inspection.css';
import './appearance.css';
import './themes.css';
import './brand-icons.css';
import './components/header-notifications.css';
import './components/pagination.css';
import './iclusters-brand.css';
import './viewport.css';
import './components/ssh-dialog.css';

// The standalone diagnostics page loads the actual entry and waits for a React commit.
if(location.pathname==='/connection-check.html'){
 const report=(ok:boolean)=>window.dispatchEvent(new CustomEvent('iclusters-boot-ready',{detail:{entry:import.meta.url,ok}}));
 // Loading the route also checks its lazy dependencies without signing in or polling providers.
 void import('./pages/Dashboard').then(()=>{
  const probe=ReactDOM.createRoot(document.createElement('div'));
  probe.render(<span ref={node=>{
   if(node)queueMicrotask(()=>{probe.unmount();report(true)});
  }}/>);
 }).catch(()=>report(false));
}else{
 applyAppearance();
 void initializeLocale().then(()=>ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><BrowserRouter basename={clusterBase||'/'}><InterfaceMotion/><PageBoundary><App /><InstallPrompt/></PageBoundary></BrowserRouter></React.StrictMode>
 ));
 startWorkerUpdates();
}

import './components/distribution-summary.css';

import './components/cluster-topology.css';

import './components/VmCreateWizard.css';

import './connection-notice.css';

import './responsive-layout.css';
import './interaction-feedback.css';

import {startWorkerUpdates} from './service-worker';

import './icon-surfaces.css';

import './motion.css';

import './backup-layout.css';

import './alert-layout.css';

import './typography.css';

import './action-buttons.css';
