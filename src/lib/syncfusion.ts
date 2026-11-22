import { registerLicense } from '@syncfusion/ej2-base'

/** Register Syncfusion Community license once at app startup. */
export function registerSyncfusionLicense() {
  const key = import.meta.env.VITE_SYNCFUSION_LICENSE
  if (typeof key === 'string' && key.trim()) {
    registerLicense(key.trim())
  }
}
