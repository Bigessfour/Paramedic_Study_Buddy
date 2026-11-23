import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Amplify } from 'aws-amplify'
import outputs from '../amplify_outputs.json'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { installGlobalErrorHandlers } from '@/lib/errorLog'
import { registerSyncfusionLicense } from '@/lib/syncfusion'
import App from './App.tsx'
import './index.css'

Amplify.configure(outputs)
registerSyncfusionLicense()
installGlobalErrorHandlers()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
