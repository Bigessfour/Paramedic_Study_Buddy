import { defineBackend } from '@aws-amplify/backend'
import { auth } from './auth/resource'
import { data } from './data/resource'
import { xaiStudy } from './functions/xai-study/resource'
import { storage } from './storage/resource'

const backend = defineBackend({
  auth,
  data,
  storage,
  xaiStudy,
})

// No guest/unauthenticated identity access for this study app.
const { cfnIdentityPool } = backend.auth.resources.cfnResources
cfnIdentityPool.allowUnauthenticatedIdentities = false
