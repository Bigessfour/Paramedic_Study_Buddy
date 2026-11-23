import { defineStorage } from '@aws-amplify/backend'

/**
 * Private uploads stay per-identity. Class library is readable by any signed-in
 * classmate; only the uploading identity can write under their entity_id.
 * {entity_id} must be the final path segment before the wildcard (Amplify Gen 2).
 */
export const storage = defineStorage({
  name: 'studyMaterials',
  access: (allow) => ({
    'private/materials/{entity_id}/*': [
      allow.entity('identity').to(['read', 'write', 'delete']),
    ],
    'class-library/{entity_id}/*': [
      allow.authenticated.to(['read']),
      allow.entity('identity').to(['write', 'delete']),
    ],
  }),
})
