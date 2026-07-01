import { generateText } from "ai"
import { describe, expect, test, vi } from "vitest"
import { createOpenAIOAuth } from "../src/index.js"

describe("createOpenAIOAuth", () => {
	test("uses request-bound OAuth credentials for generateText calls", async () => {
		const fetch = vi.fn(
			async () =>
				new Response(
					[
						"event: response.created",
						'data: {"type":"response.created","response":{"id":"resp_1","model":"gpt-5.4-mini","created_at":1735689600}}',
						"",
						"event: response.output_text.delta",
						'data: {"type":"response.output_text.delta","item_id":"msg_1","output_index":0,"content_index":0,"delta":"hello"}',
						"",
						"event: response.output_text.done",
						'data: {"type":"response.output_text.done","item_id":"msg_1","output_index":0,"content_index":0,"text":"hello"}',
						"",
						"event: response.completed",
						'data: {"type":"response.completed","response":{"id":"resp_1","model":"gpt-5.4-mini","created_at":1735689600,"status":"completed","output":[],"usage":{"input_tokens":1,"output_tokens":1}}}',
						"",
						"",
					].join("\n"),
					{
						headers: { "Content-Type": "text/event-stream" },
					},
				),
		)
		const openai = createOpenAIOAuth({
			kind: "openai-oauth",
			fetch,
			getSession: async () => ({
				accessToken: "access-token",
				accountId: "acct-1",
			}),
			refreshSession: async () => ({
				accessToken: "access-token",
				accountId: "acct-1",
			}),
		})

		const result = await generateText({
			model: openai("gpt-5.4-mini"),
			prompt: "hi",
		})

		expect(result.text).toBe("hello")
		expect(fetch).toHaveBeenCalledTimes(1)

		const [url, init] = fetch.mock.calls[0] ?? []
		const headers = new Headers(init?.headers)
		const body = JSON.parse(String(init?.body))

		expect(url).toBe("https://chatgpt.com/backend-api/codex/responses")
		expect(headers.get("authorization")).toBe("Bearer access-token")
		expect(headers.get("chatgpt-account-id")).toBe("acct-1")
		expect(body.stream).toBe(true)
		expect(body.store).toBe(false)
	})
})
