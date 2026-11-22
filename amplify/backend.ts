import { defineBackend } from '@aws-amplify/backend'
import { auth } from './auth/resource'

const backend = defineBackend({
  auth,
})

// No guest/unauthenticated identity access for this study app.
const { cfnIdentityPool } = backend.auth.resources.cfnResources
cfnIdentityPool.allowUnauthenticatedIdentities = false
