import { type ClientSchema, a, defineData } from '@aws-amplify/backend'
import { xaiStudy } from '../functions/xai-study/resource'

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

  Attempt: a
    .model({
      scope: a.string().required(),
      questionCount: a.integer().required(),
      scorePercent: a.float().required(),
      mcCorrect: a.integer().required(),
      mcTotal: a.integer().required(),
      writtenAvgScore: a.float(),
      writtenTotal: a.integer().required(),
      usedSampleContext: a.boolean().required(),
      payloadJson: a.string().required(),
      completedAt: a.datetime().required(),
    })
    .authorization((allow) => [allow.owner()]),

  generatePracticeTest: a
    .mutation()
    .arguments({
      scope: a.string().required(),
      questionCount: a.integer().required(),
      mcPercent: a.integer().required(),
      context: a.string().required(),
    })
    .returns(a.json())
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(xaiStudy)),

  gradeWrittenAnswers: a
    .mutation()
    .arguments({
      context: a.string().required(),
      itemsJson: a.string().required(),
    })
    .returns(a.json())
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(xaiStudy)),
})

export type Schema = ClientSchema<typeof schema>

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'userPool',
  },
})
