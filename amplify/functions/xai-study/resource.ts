import { defineFunction, secret } from '@aws-amplify/backend'

export const xaiStudy = defineFunction({
  name: 'xai-study',
  entry: './handler.ts',
  timeoutSeconds: 120,
  memoryMB: 512,
  environment: {
    XAI_API_KEY: secret('XAI_API_KEY'),
    XAI_MODEL: 'grok-3-mini',
    EMBEDDING_PROVIDER: 'bedrock',
    EMBEDDING_MODEL: 'amazon.titan-embed-text-v2:0',
    BEDROCK_REGION: 'us-east-2',
  },
})
