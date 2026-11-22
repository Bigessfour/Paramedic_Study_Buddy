# Paramedic Study Buddy — Project Rules

## Stack (locked)

- React + Vite + TypeScript
- shadcn/ui + Tailwind CSS
- Selective Syncfusion (Community License) for Grid/Charts
- AWS Amplify (Cognito auth, Storage/S3, Hosting)
- xAI (Grok) for practice-test generation and written-answer grading

Do not introduce alternate frameworks, UI kits, or AI providers without an explicit decision.

## Definition of Done

Ship v1 when the checklist in `README.md` is green. Stop there. Further polish belongs in a v1.1 milestone.

## Phase discipline

Work one phase at a time from `PHASED_WORKFLOW.md`. Do not expand scope into later phases. If tempted to add extras: stay within the current phase.

## Multi-tenant isolation

- Every user’s materials, attempts, and progress must be isolated.
- Prefer Cognito `sub` as the isolation key, or a custom attribute `custom:tenantId` when classmates share a cohort.
- S3 keys must be user-scoped (e.g. `private/${userId}/materials/`).
- Never query or display another user’s data. Client filters are not enough — enforce ownership in Amplify auth rules / IAM / data authorization.

## Syncfusion

- Community License only.
- Register the license key early in app boot from `VITE_SYNCFUSION_LICENSE`.
- Never commit the license key. Prefer Material or Fluent themes so components sit cleanly with shadcn/Tailwind.

## xAI API

- Read the key from environment (`VITE_XAI_API_KEY` or a backend secret later).
- Never hardcode keys, never commit `.env` / `.env.local`, never log the full key.
- Prompts must instruct the model to stay within the user’s uploaded course material.
- Prefer structured JSON responses for questions and grading feedback.

## Secrets & env

- Use `.env.example` as the contract; real values live only in local `.env.local` or Amplify hosting env.
- Do not commit Amplify outputs that contain secrets.

## AWS account

Deploy to the personal AWS account (Amplify Hosting / S3 + CloudFront). Confirm caller identity before mutating cloud resources.
