import { defineAuth } from '@aws-amplify/backend'

/**
 * Cognito user pool for Paramedic Study Buddy.
 * Isolation key for materials/attempts: Cognito `sub` (see AuthProvider.userId).
 */
export const auth = defineAuth({
  loginWith: {
    email: true,
  },
})
