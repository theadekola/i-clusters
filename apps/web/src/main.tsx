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

applyAppearance();

void initializeLocale().then(()=>ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter><PageBoundary><App /><InstallPrompt/></PageBoundary></BrowserRouter>
  </React.StrictMode>
));

import './components/distribution-summary.css';

import './components/cluster-topology.css';

import './components/VmCreateWizard.css';

import './connection-notice.css';

import './responsive-layout.css';
import './interaction-feedback.css';

import {startWorkerUpdates} from './service-worker';
startWorkerUpdates();
