import { defineBackend } from '@aws-amplify/backend'
import { PolicyStatement } from 'aws-cdk-lib/aws-iam'
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

// On-demand Titan embeddings for RAG query vectors (same model as local embed script).
backend.xaiStudy.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    actions: ['bedrock:InvokeModel'],
    resources: [
      'arn:aws:bedrock:us-east-2::foundation-model/amazon.titan-embed-text-v2:0',
      'arn:aws:bedrock:us-east-1::foundation-model/amazon.titan-embed-text-v2:0',
    ],
  }),
)
