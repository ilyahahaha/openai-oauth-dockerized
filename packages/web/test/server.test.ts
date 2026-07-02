import { afterEach, describe, expect, test, vi } from "vitest"
import {
	completeLogin,
	exchangeCode,
	openaiAuthHeaders,
	refreshSession,
} from "../src/index.js"
import { openaiCredentials } from "../src/server.js"

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

	test("openaiAuthHeaders returns plain object headers and refreshes expiring stored browser sessions", async () => {
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
		const headers = await openaiAuthHeaders({
			headers: { "content-type": "application/json" },
			sessionStore,
			fetch,
			now: () => new Date("2026-01-01T00:00:00.000Z"),
			tokenUrl: "https://auth.example.test/oauth/token",
		})

		expect(headers).toMatchObject({
			authorization: `Bearer ${accessToken}`,
			"chatgpt-account-id": "acct_refreshed",
			"content-type": "application/json",
		})
		expect({ ...headers }).toMatchObject({
			authorization: `Bearer ${accessToken}`,
			"chatgpt-account-id": "acct_refreshed",
		})
		expect(sessionStore.set).toHaveBeenCalledWith({
			accessToken,
			accountId: "acct_refreshed",
			idToken: accessToken,
			refreshToken: "refresh-token",
			lastRefresh: "2026-01-01T00:00:00.000Z",
		})
	})

	test("server openaiCredentials reads request-bound auth headers", async () => {
		const credentials = openaiCredentials(
			new Request("https://app.example.test/api/chat", {
				headers: {
					Authorization: "Bearer access-token",
					"chatgpt-account-id": "acct-1",
				},
			}),
		)

		await expect(credentials.getSession()).resolves.toEqual({
			accessToken: "access-token",
			accountId: "acct-1",
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
