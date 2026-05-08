// Splunk RUM MUST be the first import — captures full page lifecycle including
// Cornerstone DICOM image loads (the critical path ThousandEyes monitors)
import './splunk-rum';

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
