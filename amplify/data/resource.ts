import { type ClientSchema, a, defineData } from '@aws-amplify/backend'

const schema = a.schema({
  Material: a
    .model({
      filename: a.string().required(),
      contentType: a.string().required(),
      sizeBytes: a.integer().required(),
      s3Key: a.string().required(),
      extractedText: a.string(),
      extractStatus: a.enum(['pending', 'ready', 'failed']),
      extractError: a.string(),
      uploadedAt: a.datetime().required(),
    })
    .authorization((allow) => [allow.owner()]),
})

export type Schema = ClientSchema<typeof schema>

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'userPool',
  },
})
