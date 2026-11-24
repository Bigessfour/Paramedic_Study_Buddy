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
      /** JSON array of topic/chapter tags for weakness analytics */
      topicsJson: a.string(),
      completedAt: a.datetime().required(),
    })
    .authorization((allow) => [allow.owner()]),

  TutorThread: a
    .model({
      title: a.string().required(),
      messagesJson: a.string().required(),
      usedSampleContext: a.boolean().required(),
      updatedAt: a.datetime().required(),
    })
    .authorization((allow) => [allow.owner()]),

  Flashcard: a
    .model({
      front: a.string().required(),
      back: a.string().required(),
      topic: a.string().required(),
      sourceType: a.enum(['material', 'attempt', 'manual']),
      sourceId: a.string(),
      ease: a.float().required(),
      intervalDays: a.float().required(),
      repetitions: a.integer().required(),
      dueAt: a.datetime().required(),
      createdAt: a.datetime().required(),
    })
    .authorization((allow) => [allow.owner()]),

  /** RAG chunk + embedding vector (owner-isolated). Full chapter text stays in S3. */
  CourseChunk: a
    .model({
      chapter: a.string().required(),
      source: a.string().required(),
      tier: a.string(),
      text: a.string().required(),
      embeddingJson: a.string().required(),
      charStart: a.integer(),
      charEnd: a.integer(),
      chunkKey: a.string().required(),
    })
    .authorization((allow) => [allow.owner()]),

  /**
   * Shared class textbook library. Any signed-in classmate can read;
   * only the uploading owner can create/update/delete.
   */
  ClassMaterial: a
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
    .authorization((allow) => [
      allow.owner(),
      allow.authenticated().to(['read']),
    ]),

  /** Shared class RAG chunks (authenticated read; owner write). */
  ClassChunk: a
    .model({
      chapter: a.string().required(),
      source: a.string().required(),
      tier: a.string(),
      text: a.string().required(),
      embeddingJson: a.string().required(),
      charStart: a.integer(),
      charEnd: a.integer(),
      chunkKey: a.string().required(),
    })
    .authorization((allow) => [
      allow.owner(),
      allow.authenticated().to(['read']),
    ]),

  /** Client-captured runtime errors (owner-isolated; no secrets). */
  ErrorLog: a
    .model({
      message: a.string().required(),
      stack: a.string(),
      route: a.string(),
      componentHint: a.string(),
      userAgent: a.string(),
      createdAt: a.datetime().required(),
    })
    .authorization((allow) => [allow.owner()]),

  /** Lightweight feature-usage analytics (owner-isolated). */
  UsageEvent: a
    .model({
      eventName: a.string().required(),
      metadataJson: a.string(),
      route: a.string(),
      createdAt: a.datetime().required(),
    })
    .authorization((allow) => [allow.owner()]),

  /** User feature ideas (owner-isolated list). */
  FeatureRequest: a
    .model({
      title: a.string().required(),
      description: a.string().required(),
      status: a.enum(['open', 'done']),
      createdAt: a.datetime().required(),
    })
    .authorization((allow) => [allow.owner()]),

  generatePracticeTest: a
    .mutation()
    .arguments({
      scope: a.string().required(),
      questionCount: a.integer().required(),
      mcPercent: a.integer().required(),
      context: a.string().required(),
      courseFormat: a.boolean(),
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

  tutorChat: a
    .mutation()
    .arguments({
      message: a.string().required(),
      context: a.string().required(),
      historyJson: a.string(),
    })
    .returns(a.json())
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(xaiStudy)),

  generateFlashcards: a
    .mutation()
    .arguments({
      context: a.string().required(),
      count: a.integer(),
      topicHint: a.string(),
    })
    .returns(a.json())
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(xaiStudy)),

  /**
   * Clinical scenario pack (vignette + ordered short-answer steps).
   * Server generate→verify→retry; only verified scenarios are returned (fail closed).
   */
  generateClinicalScenario: a
    .mutation()
    .arguments({
      scope: a.string().required(),
      context: a.string().required(),
      /** Pack size 1–5 (default 1). */
      count: a.integer(),
      /** Optional chapter label for prompting (e.g. "12"). */
      chapter: a.string(),
    })
    .returns(a.json())
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(xaiStudy)),

  /** Returns a query embedding vector for client-side cosine RAG. */
  embedQuery: a
    .mutation()
    .arguments({
      query: a.string().required(),
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
