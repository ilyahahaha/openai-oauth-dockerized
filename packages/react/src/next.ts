import { createRelayHandler } from "@openai-oauth/web"

const handler = createRelayHandler()

export const GET = (request: Request): Promise<Response> => handler(request)
export const POST = (request: Request): Promise<Response> => handler(request)
export const OPTIONS = (request: Request): Promise<Response> => handler(request)
