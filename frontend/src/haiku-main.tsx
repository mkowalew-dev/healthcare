import './splunk-rum-haiku';

import React from 'react';
import ReactDOM from 'react-dom/client';
import AppHaiku from './AppHaiku';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppHaiku />
  </React.StrictMode>
);
