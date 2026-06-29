import { afterEach, describe, expect, test, vi } from "vitest"
import {
	completeLogin,
	createRelayHandler,
	exchangeCode,
	openaiCredentials,
	refreshSession,
} from "../src/index.js"

const createToken = (accountId: string): string =>
	[
		Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString(
			"base64url",
		),
		Buffer.from(
			JSON.stringify({
				"https://api.openai.com/auth": {
					chatgpt_account_id: accountId,
				},
			}),
		).toString("base64url"),
		"signature",
	].join(".")

const readJson = async <T>(response: Response): Promise<T> =>
	(await response.json()) as T

afterEach(() => {
	vi.unstubAllGlobals()
})

describe("@openai-oauth/web", () => {
	test("completeLogin keeps an existing session on stale callback reloads", async () => {
		const session = {
			accessToken: "access-token",
			accountId: "acct-1",
			refreshToken: "refresh-token",
		}
		const sessionStore = {
			get: vi.fn(async () => session),
			set: vi.fn(async () => {}),
			clear: vi.fn(async () => {}),
		}
		const replaceState = vi.fn()
		vi.stubGlobal("window", {
			location: {
				href: "https://app.example.test/auth/callback?code=stale&state=old",
				origin: "https://app.example.test",
				pathname: "/auth/callback",
				search: "?code=stale&state=old",
				hash: "",
			},
			history: {
				replaceState,
			},
			sessionStorage: {
				getItem: vi.fn(() => null),
				setItem: vi.fn(),
				removeItem: vi.fn(),
			},
		} as unknown as Window)

		await expect(completeLogin({ sessionStore })).resolves.toEqual(session)
		expect(sessionStore.set).not.toHaveBeenCalled()
		expect(replaceState).toHaveBeenCalledWith(null, "", "/")
	})

	test("createRelayHandler relays same-origin model requests", async () => {
		const fetch = vi.fn(async () => {
			return new Response(
				[
					"event: response.output_item.done",
					'data: {"type":"response.output_item.done","item":{"type":"message","role":"assistant","id":"msg_1","content":[{"type":"output_text","text":"hello","annotations":[]}]}}',
					"",
					"event: response.completed",
					'data: {"type":"response.completed","response":{"id":"resp_1","status":"completed","output":[]}}',
					"",
					"",
				].join("\n"),
				{
					headers: {
						"Content-Type": "text/event-stream",
					},
				},
			)
		})
		const handler = createRelayHandler({ fetch })

		const response = await handler(
			new Request("https://app.example.test/api/openai-oauth/v1/responses", {
				method: "POST",
				headers: {
					Authorization: "Bearer access-token",
					"Content-Type": "application/json",
					"chatgpt-account-id": "acct-1",
				},
				body: JSON.stringify({
					model: "gpt-5.4-mini",
					input: "hi",
				}),
			}),
		)

		expect(response.status).toBe(200)
		expect(await readJson(response)).toEqual({
			id: "resp_1",
			status: "completed",
			output: [
				{
					type: "message",
					role: "assistant",
					id: "msg_1",
					content: [
						{
							type: "output_text",
							text: "hello",
							annotations: [],
						},
					],
				},
			],
		})

		const [url, init] = fetch.mock.calls[0] ?? []
		const headers = new Headers(init?.headers)
		const body = JSON.parse(String(init?.body))
		expect(url).toBe("https://chatgpt.com/backend-api/codex/responses")
		expect(headers.get("authorization")).toBe("Bearer access-token")
		expect(headers.get("chatgpt-account-id")).toBe("acct-1")
		expect(body.model).toBe("gpt-5.4-mini")
		expect(body.input).toBe("hi")
		expect(body.store).toBe(false)
		expect(body.stream).toBe(true)
	})

	test("createRelayHandler closes relayed SSE on terminal events", async () => {
		let upstreamCancelled = false
		const fetch = vi.fn(async () => {
			return new Response(
				new ReadableStream<Uint8Array>({
					start(controller) {
						controller.enqueue(
							new TextEncoder().encode(
								[
									"event: response.created",
									'data: {"type":"response.created","response":{"id":"resp_1","status":"in_progress"}}',
									"",
									"event: response.completed",
									'data: {"type":"response.completed","response":{"id":"resp_1","status":"completed"}}',
									"",
								].join("\n"),
							),
						)
					},
					cancel() {
						upstreamCancelled = true
					},
				}),
				{
					headers: {
						"Content-Type": "text/event-stream",
					},
				},
			)
		})
		const handler = createRelayHandler({ fetch })

		const response = await handler(
			new Request("https://app.example.test/api/openai-oauth/v1/responses", {
				method: "POST",
				headers: {
					Authorization: "Bearer access-token",
					"Content-Type": "application/json",
					"chatgpt-account-id": "acct-1",
				},
				body: JSON.stringify({
					model: "gpt-5.4-mini",
					input: "hi",
					stream: true,
				}),
			}),
		)

		const text = await Promise.race([
			response.text(),
			new Promise<string>((_, reject) =>
				setTimeout(() => {
					reject(new Error("Timed out waiting for relayed SSE to close."))
				}, 100),
			),
		])

		expect(text).toContain("event: response.completed")
		expect(upstreamCancelled).toBe(true)
	})

	test("openaiCredentials refreshes expiring stored browser sessions", async () => {
		const accessToken = createToken("acct_refreshed")
		const stored = {
			accessToken: createToken("acct_old"),
			accountId: "acct_old",
			refreshToken: "refresh-token",
			expiresAt: "2026-01-01T00:01:00.000Z",
			lastRefresh: "2026-01-01T00:00:00.000Z",
		}
		const sessionStore = {
			get: vi.fn(async () => stored),
			set: vi.fn(async () => {}),
			clear: vi.fn(async () => {}),
		}
		const fetch = vi.fn(async () => {
			return new Response(
				JSON.stringify({
					access_token: accessToken,
					id_token: accessToken,
				}),
				{
					status: 200,
					headers: { "Content-Type": "application/json" },
				},
			)
		})
		const auth = openaiCredentials({
			sessionStore,
			fetch,
			now: () => new Date("2026-01-01T00:00:00.000Z"),
			tokenUrl: "https://auth.example.test/oauth/token",
		})

		await expect(auth.getSession()).resolves.toEqual({
			accessToken,
			accountId: "acct_refreshed",
			idToken: accessToken,
			refreshToken: "refresh-token",
			lastRefresh: "2026-01-01T00:00:00.000Z",
		})
		expect(sessionStore.set).toHaveBeenCalledWith({
			accessToken,
			accountId: "acct_refreshed",
			idToken: accessToken,
			refreshToken: "refresh-token",
			lastRefresh: "2026-01-01T00:00:00.000Z",
		})
	})

	test("exchanges an authorization code for a browser-storable session", async () => {
		const accessToken = createToken("acct_exchange")
		const fetch = vi.fn(async () => {
			return new Response(
				JSON.stringify({
					access_token: accessToken,
					refresh_token: "refresh-token",
					id_token: accessToken,
					expires_in: 3600,
				}),
				{
					status: 200,
					headers: { "Content-Type": "application/json" },
				},
			)
		})
		await expect(
			exchangeCode(
				{
					code: "auth-code",
					codeVerifier: "verifier",
					redirectUri: "https://app.example.test/auth/callback",
				},
				{
					fetch,
					now: () => new Date("2026-01-01T00:00:00.000Z"),
					tokenUrl: "https://auth.example.test/oauth/token",
				},
			),
		).resolves.toEqual({
			accessToken,
			accountId: "acct_exchange",
			idToken: accessToken,
			refreshToken: "refresh-token",
			expiresAt: "2026-01-01T01:00:00.000Z",
			lastRefresh: "2026-01-01T00:00:00.000Z",
		})

		const [url, init] = fetch.mock.calls[0] ?? []
		expect(url).toBe("https://auth.example.test/oauth/token")
		expect(JSON.parse(String(init?.body))).toMatchObject({
			grant_type: "authorization_code",
			code: "auth-code",
			code_verifier: "verifier",
			redirect_uri: "https://app.example.test/auth/callback",
		})
	})

	test("refreshes sessions and keeps the previous refresh token when none is rotated", async () => {
		const accessToken = createToken("acct_refresh")
		const fetch = vi.fn(async () => {
			return new Response(
				JSON.stringify({
					access_token: accessToken,
					id_token: accessToken,
				}),
				{
					status: 200,
					headers: { "Content-Type": "application/json" },
				},
			)
		})
		await expect(
			refreshSession(
				{
					refreshToken: "old-refresh-token",
				},
				{
					fetch,
					now: () => new Date("2026-01-01T00:00:00.000Z"),
					tokenUrl: "https://auth.example.test/oauth/token",
				},
			),
		).resolves.toEqual({
			accessToken,
			accountId: "acct_refresh",
			idToken: accessToken,
			refreshToken: "old-refresh-token",
			lastRefresh: "2026-01-01T00:00:00.000Z",
		})

		const [, init] = fetch.mock.calls[0] ?? []
		expect(JSON.parse(String(init?.body))).toMatchObject({
			grant_type: "refresh_token",
			refresh_token: "old-refresh-token",
		})
	})
})
