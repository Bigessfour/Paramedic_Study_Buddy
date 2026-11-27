export type FeedbackBreadcrumb = {
  at: string
  action: string
  detail?: string
}

export type FeedbackError = {
  message: string
  stack?: string
  route?: string
  componentHint?: string
  createdAt?: string
}

export type FeedbackImage = {
  name: string
  bytes: Uint8Array
}
