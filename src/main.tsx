import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import 'leaflet/dist/leaflet.css'
import './index.css'
import App from './App.tsx'

if ('serviceWorker' in navigator) {
  if (Capacitor.isNativePlatform()) {
    // Native releases must always use the assets bundled in the installed APK.
    void navigator.serviceWorker.getRegistrations().then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
    if ('caches' in window) void caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
  } else if (import.meta.env.PROD) {
    window.addEventListener('load', () => { void navigator.serviceWorker.register('/sw.js') })
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
