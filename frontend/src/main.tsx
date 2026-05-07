import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import App from './App';
import { setSettingsStoreRef } from './lib/api';
import { useSettingsStore } from './stores/settingsStore';

// Wire settings store into the API client so it can read apiBaseUrl/apiKey
setSettingsStoreRef(useSettingsStore);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
