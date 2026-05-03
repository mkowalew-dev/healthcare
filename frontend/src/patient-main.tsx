// Splunk RUM MUST be the first import — captures full page lifecycle
import './splunk-rum-patient';

import React from 'react'
import ReactDOM from 'react-dom/client'
import AppPatient from './AppPatient.tsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppPatient />
  </React.StrictMode>,
)
