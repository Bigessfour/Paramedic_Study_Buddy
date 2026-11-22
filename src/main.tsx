import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Amplify } from 'aws-amplify'
import outputs from '../amplify_outputs.json'
import { registerSyncfusionLicense } from '@/lib/syncfusion'
import App from './App.tsx'
import './index.css'

Amplify.configure(outputs)
registerSyncfusionLicense()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
