import { defineStorage } from '@aws-amplify/backend'

/**
 * User-private course materials. {entity_id} must be the final path segment
 * before the wildcard (Amplify Gen 2 requirement).
 */
export const storage = defineStorage({
  name: 'studyMaterials',
  access: (allow) => ({
    'private/materials/{entity_id}/*': [
      allow.entity('identity').to(['read', 'write', 'delete']),
    ],
  }),
})
