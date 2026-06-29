import { afterEach, describe, expect, test, vi } from "vitest"
import {
	collectCompletedResponseFromSse,
	createCodexOAuthFetch,
	createOpenAIOAuthTransport,
	normalizeCodexResponsesBody,
} from "../src/index.js"
import {
	createOpenAIOAuthRelayTransport,
	createOpenAIOAuthTransport as createRuntimeOpenAIOAuthTransport,
} from "../src/runtime.js"

const session = {
	accessToken: "access-token",
	accountId: "acct-1",
}

afterEach(() => {
	vi.restoreAllMocks()
})

describe("normalizeCodexResponsesBody", () => {
	test("adds an empty-string fallback, disables store, and strips max_output_tokens", () => {
		const normalized = normalizeCodexResponsesBody({
			model: "gpt-5.2",
			max_output_tokens: 128,
		})

		expect(normalized.instructions).toBe("")
		expect(normalized.store).toBe(false)
		expect("max_output_tokens" in normalized).toBe(false)
	})

	test("preserves caller-provided instructions and explicit store", () => {
		const normalized = normalizeCodexResponsesBody(
			{
				instructions: "caller-instructions",
				store: true,
			},
			{
				instructions: "default-instructions",
			},
		)

		expect(normalized.instructions).toBe("caller-instructions")
		expect(normalized.store).toBe(true)
	})

	test("preserves explicit empty and whitespace instructions", () => {
		expect(
			normalizeCodexResponsesBody(
				{
					instructions: "",
				},
				{
					instructions: "default-instructions",
				},
			).instructions,
		).toBe("")

		expect(
			normalizeCodexResponsesBody(
				{
					instructions: " ",
				},
				{
					instructions: "default-instructions",
				},
			).instructions,
		).toBe(" ")
	})

	test("allows callers to override the store default", () => {
		const normalized = normalizeCodexResponsesBody(
			{
				model: "gpt-5.2",
			},
			{
				storeResponses: false,
			},
		)

		expect(normalized.store).toBe(false)
	})
})

describe("createCodexOAuthFetch", () => {
	test("creates a same-origin relay connection from a credential source", async () => {
		const fetch = vi.fn(async () => new Response(null, { status: 200 }))
		const connection = createOpenAIOAuthRelayTransport(
			{
				kind: "openai-oauth",
				relay: "/api/openai-oauth",
				getSession: async () => session,
				refreshSession: async () => session,
			},
			{ fetch },
		)

		expect(connection.baseURL).toBe("/api/openai-oauth/v1")

		await connection.request("/responses", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ model: "gpt-5.4-mini", input: "hi" }),
		})

		const [url, init] = fetch.mock.calls[0] ?? []
		const headers = new Headers(init?.headers)
		expect(url).toBe("/api/openai-oauth/responses")
		expect(headers.get("authorization")).toBe("Bearer access-token")
		expect(headers.get("chatgpt-account-id")).toBe("acct-1")
	})

	test("creates an in-memory OpenAI-compatible connection", async () => {
		const fetch = vi.fn(async () => new Response(null, { status: 200 }))
		const connection = createOpenAIOAuthTransport({
			auth: session,
			fetch,
		})

		expect(connection.kind).toBe("openai-compatible")
		expect(connection.baseURL).toBe("https://openai-oauth.local/v1")

		await connection.request("/responses", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ model: "gpt-5.2" }),
		})

		expect(fetch).toHaveBeenCalledWith(
			"https://chatgpt.com/backend-api/codex/responses",
			expect.objectContaining({
				method: "POST",
			}),
		)
	})

	test("injects oauth headers and normalizes responses requests", async () => {
		const fetch = vi.fn(async () => new Response(null, { status: 200 }))

		const oauthFetch = createCodexOAuthFetch({
			auth: session,
			fetch,
			instructions: "core-instructions",
		})

		await oauthFetch("https://example.test/v1/responses", {
			method: "POST",
			headers: {
				Authorization: "Bearer ignored",
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				model: "gpt-5.2",
				max_output_tokens: 5,
			}),
		})

		expect(fetch).toHaveBeenCalledTimes(1)
		expect(fetch).toHaveBeenCalledWith(
			"https://chatgpt.com/backend-api/codex/responses",
			expect.objectContaining({
				headers: expect.any(Headers),
				body: expect.any(String),
			}),
		)

		const [, init] = fetch.mock.calls[0] ?? []
		const headers = new Headers(init?.headers)
		const body = JSON.parse(String(init?.body))

		expect(headers.get("authorization")).toMatch(/^Bearer /)
		expect(headers.get("chatgpt-account-id")).toBeTruthy()
		expect(body.instructions).toBe("core-instructions")
		expect(body.store).toBe(false)
		expect(body.max_output_tokens).toBeUndefined()
	})

	test("preserves absolute codex urls without duplicating the upstream path", async () => {
		const fetch = vi.fn(async () => new Response(null, { status: 200 }))

		const oauthFetch = createCodexOAuthFetch({
			auth: session,
			fetch,
		})

		await oauthFetch(
			"https://chatgpt.com/backend-api/codex/responses?foo=bar",
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					model: "gpt-5.2",
				}),
			},
		)

		expect(fetch).toHaveBeenCalledTimes(1)
		expect(fetch).toHaveBeenCalledWith(
			"https://chatgpt.com/backend-api/codex/responses?foo=bar",
			expect.any(Object),
		)
	})

	test("supports relative response paths", async () => {
		const fetch = vi.fn(async () => new Response(null, { status: 200 }))

		const oauthFetch = createCodexOAuthFetch({
			auth: session,
			fetch,
		})

		await oauthFetch("responses", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				model: "gpt-5.2",
			}),
		})

		expect(fetch).toHaveBeenCalledTimes(1)
		expect(fetch).toHaveBeenCalledWith(
			"https://chatgpt.com/backend-api/codex/responses",
			expect.any(Object),
		)
	})

	test("can disable local replay state entirely", async () => {
		const fetch = vi.fn(async () => new Response(null, { status: 200 }))

		const oauthFetch = createCodexOAuthFetch({
			auth: session,
			fetch,
			responsesState: false,
		})

		await oauthFetch("https://example.test/v1/responses", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				model: "gpt-5.2",
				previous_response_id: "resp_1",
				input: [],
			}),
		})

		const [, init] = fetch.mock.calls[0] ?? []
		expect(JSON.parse(String(init?.body))).toMatchObject({
			model: "gpt-5.2",
			previous_response_id: "resp_1",
			input: [],
			store: false,
			instructions: "",
		})
	})

	test("runtime connection replays prior response state locally", async () => {
		const fetch = vi.fn(async () => {
			return new Response(
				[
					"event: response.completed",
					'data: {"response":{"id":"resp_1","status":"completed","output":[{"type":"function_call","id":"fc_1","call_id":"call_1","name":"weather","arguments":"{}"}]}}',
					"",
					"",
				].join("\n"),
				{
					headers: { "Content-Type": "text/event-stream" },
				},
			)
		})
		const connection = createRuntimeOpenAIOAuthTransport({
			auth: {
				accessToken: "access-token",
				accountId: "acct-1",
			},
			fetch,
		})

		const firstResponse = await connection.request("/responses", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				model: "gpt-5.4-mini",
				input: [{ role: "user", content: "Use the weather tool." }],
				stream: true,
			}),
		})
		await firstResponse.text()

		await connection.request("/responses", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				model: "gpt-5.4-mini",
				previous_response_id: "resp_1",
				input: [{ type: "item_reference", id: "fc_1" }],
				stream: true,
			}),
		})

		const [, secondInit] = fetch.mock.calls[1] ?? []
		const secondBody = JSON.parse(String(secondInit?.body))
		expect(secondBody.previous_response_id).toBeUndefined()
		expect(secondBody.input).toEqual([
			{ role: "user", content: "Use the weather tool." },
			{
				type: "function_call",
				id: "fc_1",
				call_id: "call_1",
				name: "weather",
				arguments: "{}",
			},
			{
				type: "function_call",
				id: "fc_1",
				call_id: "call_1",
				name: "weather",
				arguments: "{}",
			},
		])
	})

	test("accepts an async session supplier", async () => {
		const fetch = vi.fn(async () => new Response(null, { status: 200 }))
		const getSession = vi.fn(async () => session)
		const oauthFetch = createCodexOAuthFetch({
			auth: getSession,
			fetch,
		})

		await oauthFetch("responses", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				model: "gpt-5.2",
			}),
		})

		expect(getSession).toHaveBeenCalledTimes(1)
		expect(fetch).toHaveBeenCalledWith(
			"https://chatgpt.com/backend-api/codex/responses",
			expect.any(Object),
		)
	})
})

describe("collectCompletedResponseFromSse", () => {
	test("returns the completed response object", async () => {
		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(
					new TextEncoder().encode(
						[
							"event: response.created",
							'data: {"response":{"id":"resp_1","status":"in_progress"}}',
							"",
							"event: response.completed",
							'data: {"response":{"id":"resp_1","status":"completed","output":[{"type":"message"}]}}',
							"",
						].join("\n"),
					),
				)
				controller.close()
			},
		})

		await expect(collectCompletedResponseFromSse(stream)).resolves.toEqual({
			id: "resp_1",
			status: "completed",
			output: [{ type: "message" }],
		})
	})

	test("returns after response.completed even when the stream stays open", async () => {
		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(
					new TextEncoder().encode(
						[
							"event: response.completed",
							'data: {"response":{"id":"resp_1","status":"completed","output":[{"type":"message"}]}}',
							"",
							"",
						].join("\n"),
					),
				)
			},
		})

		await expect(collectCompletedResponseFromSse(stream)).resolves.toEqual({
			id: "resp_1",
			status: "completed",
			output: [{ type: "message" }],
		})
	})

	test("fills completed response output from streamed output item events", async () => {
		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(
					new TextEncoder().encode(
						[
							"event: response.output_item.done",
							'data: {"type":"response.output_item.done","item":{"type":"function_call","id":"fc_1","call_id":"call_1","name":"weather","arguments":"{}"}}',
							"",
							"event: response.completed",
							'data: {"type":"response.completed","response":{"id":"resp_1","status":"completed","output":[]}}',
							"",
							"",
						].join("\n"),
					),
				)
			},
		})

		await expect(collectCompletedResponseFromSse(stream)).resolves.toEqual({
			id: "resp_1",
			status: "completed",
			output: [
				{
					type: "function_call",
					id: "fc_1",
					call_id: "call_1",
					name: "weather",
					arguments: "{}",
				},
			],
		})
	})
})
