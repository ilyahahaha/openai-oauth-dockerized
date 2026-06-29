import {
	collectCompletedResponseFromSse,
	createCodexOAuthClient,
	createOpenAIOAuthRequest,
	deriveAccountId,
	exchangeOpenAIOAuthCode,
	type FetchFunction,
	normalizeCodexResponsesBody,
	type OpenAIOAuth,
	type OpenAIOAuthRequest,
	type OpenAIOAuthRequestOptions,
	type OpenAIOAuthSession,
	type OpenAIOAuthTokenResponse,
	parseJwtClaims,
	refreshOpenAIOAuthTokens,
	type SessionStore,
	usesServerReplayState,
} from "@openai-oauth/core"

export type { OpenAIOAuth, OpenAIOAuthSession, SessionStore }

export type BrowserSessionStoreOptions = {
	dbName?: string
	storeName?: string
	sessionKey?: string
	cryptoKey?: string
}

export type OpenAIOAuthTokenOptions = {
	clientId?: string
	issuer?: string
	tokenUrl?: string
	fetch?: FetchFunction
	now?: () => Date
}

export type ExchangeCodeOptions = OpenAIOAuthTokenOptions

export type ExchangeCodeInput = {
	code: string
	codeVerifier: string
	redirectUri: string
	signal?: AbortSignal
}

export type RefreshSessionOptions = OpenAIOAuthTokenOptions

export type RefreshSessionInput = {
	refreshToken: string
	signal?: AbortSignal
}

export type WebOpenAIOAuthOptions = {
	sessionStore?: SessionStore
	clientId?: string
	issuer?: string
	tokenUrl?: string
	fetch?: FetchFunction
	baseURL?: string
	headers?: Record<string, string>
	instructions?: string
	openAIBaseURL?: string
	relay?: string | false
	storeResponses?: boolean
	refresh?: boolean
	now?: () => Date
}

export type RelayHandlerOptions = {
	basePath?: string
	fetch?: FetchFunction
	headers?: Record<string, string>
	instructions?: string
	storeResponses?: boolean
}

export type StartLoginOptions = Omit<
	OpenAIOAuthRequestOptions,
	"redirectUri"
> & {
	callbackPath?: string
	redirectUri?: string
	returnTo?: string
	openMode?: "redirect" | "popup"
}

export type CompleteLoginOptions = {
	sessionStore?: SessionStore
	clientId?: string
	issuer?: string
	tokenUrl?: string
	fetch?: FetchFunction
	now?: () => Date
	url?: string
}

export type LogoutOptions = {
	sessionStore?: SessionStore
}

type StoreSettings = Required<BrowserSessionStoreOptions>

type StoredRecord<T> = {
	id: string
	value: T
}

type EncryptedSession = {
	iv: string
	ciphertext: string
}

type PendingLogin = {
	state: string
	codeVerifier: string
	redirectUri: string
	returnTo: string
}

const defaultStoreSettings: StoreSettings = {
	dbName: "openai-oauth",
	storeName: "sessions",
	sessionKey: "openai-oauth:session",
	cryptoKey: "openai-oauth:crypto-key",
}

const pendingLoginKey = "openai-oauth:pending-login"
const defaultRelayBasePath = "/api/openai-oauth"
const refreshExpiryMarginMs = 5 * 60 * 1000
const refreshIntervalMs = 55 * 60 * 1000

const jsonHeaders = {
	"Content-Type": "application/json",
}

const sseHeaders = {
	"Content-Type": "text/event-stream; charset=utf-8",
	"Cache-Control": "no-cache, no-transform",
	"X-Accel-Buffering": "no",
}

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value)

const trimTrailingSlash = (value: string): string => value.replace(/\/$/, "")

const getBearerToken = (request: Request): string | undefined => {
	const authorization = request.headers.get("authorization")
	const match = authorization?.match(/^Bearer\s+(.+)$/i)
	return match?.[1]
}

const resolveHandlerPath = (request: Request, basePath: string): string => {
	const url = new URL(request.url)
	const normalizedBasePath = trimTrailingSlash(basePath)
	let pathname = url.pathname

	if (pathname === normalizedBasePath) {
		pathname = "/"
	} else if (
		normalizedBasePath !== "/" &&
		pathname.startsWith(`${normalizedBasePath}/`)
	) {
		pathname = pathname.slice(normalizedBasePath.length)
	}

	if (pathname === "/v1") {
		pathname = "/"
	} else if (pathname.startsWith("/v1/")) {
		pathname = pathname.slice(3)
	}

	return pathname
}

const copyResponse = (response: Response): Response =>
	new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers: new Headers(response.headers),
	})

type ServerSentEventBlock = {
	event?: string
	data?: string
}

const terminalServerSentEvents = new Set([
	"error",
	"response.completed",
	"response.failed",
	"response.cancelled",
	"response.canceled",
	"response.incomplete",
])

const terminalResponseStatuses = new Set([
	"completed",
	"failed",
	"cancelled",
	"canceled",
	"incomplete",
])

const parseServerSentEventBlock = (block: string): ServerSentEventBlock => {
	const event: ServerSentEventBlock = {}
	const dataLines: string[] = []

	for (const line of block.split(/\r?\n/)) {
		if (line.startsWith("event:")) {
			event.event = line.slice(6).trim()
			continue
		}

		if (line.startsWith("data:")) {
			dataLines.push(line.slice(5).trimStart())
		}
	}

	if (dataLines.length > 0) {
		event.data = dataLines.join("\n")
	}

	return event
}

const isTerminalServerSentEventPayload = (
	data: string | undefined,
): boolean => {
	if (data === "[DONE]") {
		return true
	}

	if (typeof data !== "string" || data.length === 0) {
		return false
	}

	try {
		const parsed = JSON.parse(data)
		if (!isRecord(parsed)) {
			return false
		}

		const type = parsed.type
		if (typeof type === "string" && terminalServerSentEvents.has(type)) {
			return true
		}

		const response = parsed.response
		if (isRecord(response)) {
			const responseType = response.type
			const status = response.status
			return (
				(typeof responseType === "string" &&
					terminalServerSentEvents.has(responseType)) ||
				(typeof status === "string" && terminalResponseStatuses.has(status))
			)
		}
	} catch {}

	return false
}

const isTerminalServerSentEventBlock = (block: string): boolean => {
	const event = parseServerSentEventBlock(block)
	return (
		(typeof event.event === "string" &&
			terminalServerSentEvents.has(event.event)) ||
		isTerminalServerSentEventPayload(event.data)
	)
}

const closeResponseOnTerminalServerSentEvent = (
	response: Response,
): Response => {
	if (
		!response.body ||
		!response.headers.get("content-type")?.includes("text/event-stream")
	) {
		return response
	}

	const reader = response.body.getReader()
	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			let buffer = ""

			try {
				while (true) {
					const { value, done } = await reader.read()
					if (done) {
						break
					}

					buffer += textDecoder.decode(value, { stream: true })
					const blocks = buffer.split(/\r?\n\r?\n/)
					buffer = blocks.pop() ?? ""

					for (const block of blocks) {
						if (block.trim().length === 0) {
							continue
						}

						controller.enqueue(textEncoder.encode(`${block}\n\n`))

						if (isTerminalServerSentEventBlock(block)) {
							void reader.cancel().catch(() => {})
							controller.close()
							return
						}
					}

					if (
						buffer.trim().length > 0 &&
						isTerminalServerSentEventBlock(buffer)
					) {
						controller.enqueue(textEncoder.encode(`${buffer}\n\n`))
						void reader.cancel().catch(() => {})
						controller.close()
						return
					}
				}

				buffer += textDecoder.decode()
				if (buffer.trim().length > 0) {
					controller.enqueue(textEncoder.encode(buffer))
				}
				controller.close()
			} catch (error) {
				controller.error(error)
			} finally {
				reader.releaseLock()
			}
		},
		cancel() {
			return reader.cancel()
		},
	})

	return new Response(stream, {
		status: response.status,
		statusText: response.statusText,
		headers: new Headers(response.headers),
	})
}

const assertBrowserStorage = (): void => {
	if (
		typeof indexedDB === "undefined" ||
		typeof globalThis.crypto?.subtle === "undefined"
	) {
		throw new Error("Browser session storage requires IndexedDB and WebCrypto.")
	}
}

const assertBrowserWindow = (): Window => {
	if (typeof window === "undefined") {
		throw new Error("OpenAI OAuth browser login requires window.")
	}
	return window
}

const requestToPromise = <T>(request: IDBRequest<T>): Promise<T> =>
	new Promise((resolve, reject) => {
		request.onsuccess = () => resolve(request.result)
		request.onerror = () =>
			reject(request.error ?? new Error("IndexedDB request failed."))
	})

const openDatabaseRequest = (
	settings: StoreSettings,
	version?: number,
): Promise<IDBDatabase> => {
	assertBrowserStorage()

	const browserWindow = assertBrowserWindow()
	return new Promise((resolve, reject) => {
		const timeout = browserWindow.setTimeout(() => {
			reject(new Error("Timed out opening browser session storage."))
		}, 2000)
		const request =
			typeof version === "number"
				? indexedDB.open(settings.dbName, version)
				: indexedDB.open(settings.dbName)
		request.onupgradeneeded = () => {
			const db = request.result
			if (!db.objectStoreNames.contains(settings.storeName)) {
				db.createObjectStore(settings.storeName, { keyPath: "id" })
			}
		}
		request.onsuccess = () => {
			browserWindow.clearTimeout(timeout)
			resolve(request.result)
		}
		request.onerror = () => {
			browserWindow.clearTimeout(timeout)
			reject(request.error ?? new Error("Could not open IndexedDB."))
		}
		request.onblocked = () => {
			browserWindow.clearTimeout(timeout)
			reject(new Error("Browser session storage is blocked."))
		}
	})
}

const openDatabase = async (settings: StoreSettings): Promise<IDBDatabase> => {
	const db = await openDatabaseRequest(settings)
	if (db.objectStoreNames.contains(settings.storeName)) {
		return db
	}

	const nextVersion = db.version + 1
	db.close()
	const upgraded = await openDatabaseRequest(settings, nextVersion)
	if (upgraded.objectStoreNames.contains(settings.storeName)) {
		return upgraded
	}

	upgraded.close()
	throw new Error("Browser session storage could not create its object store.")
}

const withStore = async <T>(
	settings: StoreSettings,
	mode: IDBTransactionMode,
	fn: (store: IDBObjectStore) => Promise<T>,
): Promise<T> => {
	const db = await openDatabase(settings)
	try {
		const tx = db.transaction(settings.storeName, mode)
		const store = tx.objectStore(settings.storeName)
		return await fn(store)
	} finally {
		db.close()
	}
}

const getRecord = async <T>(
	settings: StoreSettings,
	id: string,
): Promise<T | undefined> =>
	withStore(settings, "readonly", async (store) => {
		const record = await requestToPromise<StoredRecord<T> | undefined>(
			store.get(id),
		)
		return record?.value
	})

const setRecord = async <T>(
	settings: StoreSettings,
	id: string,
	value: T,
): Promise<void> =>
	withStore(settings, "readwrite", async (store) => {
		await requestToPromise(store.put({ id, value }))
	})

const deleteRecord = async (
	settings: StoreSettings,
	id: string,
): Promise<void> =>
	withStore(settings, "readwrite", async (store) => {
		await requestToPromise(store.delete(id))
	})

const bytesToBase64 = (bytes: Uint8Array): string => {
	let binary = ""
	for (const byte of bytes) {
		binary += String.fromCharCode(byte)
	}
	return btoa(binary)
}

const base64ToBytes = (value: string): Uint8Array<ArrayBuffer> => {
	const decoded = atob(value)
	const bytes = new Uint8Array(decoded.length)
	for (let index = 0; index < decoded.length; index += 1) {
		bytes[index] = decoded.charCodeAt(index)
	}
	return bytes
}

const generateCryptoKey = async (): Promise<CryptoKey> => {
	const key = await globalThis.crypto.subtle.generateKey(
		{
			name: "AES-GCM",
			length: 256,
		},
		false,
		["encrypt", "decrypt"],
	)
	return key as CryptoKey
}

const getCryptoKey = async (settings: StoreSettings): Promise<CryptoKey> => {
	const existing = await getRecord<CryptoKey>(settings, settings.cryptoKey)
	if (existing) {
		return existing
	}

	const key = await generateCryptoKey()
	await setRecord(settings, settings.cryptoKey, key)
	return key
}

const encryptSession = async (
	key: CryptoKey,
	session: OpenAIOAuthSession,
): Promise<EncryptedSession> => {
	const iv = new Uint8Array(12)
	globalThis.crypto.getRandomValues(iv)
	const ciphertext = await globalThis.crypto.subtle.encrypt(
		{
			name: "AES-GCM",
			iv,
		},
		key,
		textEncoder.encode(JSON.stringify(session)),
	)

	return {
		iv: bytesToBase64(iv),
		ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
	}
}

const decryptSession = async (
	key: CryptoKey,
	encrypted: EncryptedSession,
): Promise<OpenAIOAuthSession> => {
	const plaintext = await globalThis.crypto.subtle.decrypt(
		{
			name: "AES-GCM",
			iv: base64ToBytes(encrypted.iv),
		},
		key,
		base64ToBytes(encrypted.ciphertext),
	)
	return JSON.parse(textDecoder.decode(plaintext)) as OpenAIOAuthSession
}

export const createSessionStore = (
	options: BrowserSessionStoreOptions = {},
): SessionStore => {
	const settings: StoreSettings = {
		...defaultStoreSettings,
		...options,
	}

	return {
		get: async () => {
			try {
				const encrypted = await getRecord<EncryptedSession>(
					settings,
					settings.sessionKey,
				)
				if (!encrypted) {
					return null
				}
				return decryptSession(await getCryptoKey(settings), encrypted)
			} catch {
				return null
			}
		},
		set: async (session) => {
			const key = await getCryptoKey(settings)
			await setRecord(
				settings,
				settings.sessionKey,
				await encryptSession(key, session),
			)
		},
		clear: async () => {
			await deleteRecord(settings, settings.sessionKey)
		},
	}
}

let defaultSessionStore: SessionStore | undefined

const getDefaultSessionStore = (): SessionStore => {
	defaultSessionStore ??= createSessionStore()
	return defaultSessionStore
}

const parseIsoDate = (value: string | undefined): Date | undefined => {
	if (typeof value !== "string" || value.length === 0) {
		return undefined
	}
	const date = new Date(value)
	return Number.isNaN(date.getTime()) ? undefined : date
}

const shouldRefreshSession = (
	session: OpenAIOAuthSession,
	now: Date,
): boolean => {
	const expiresAt = parseIsoDate(session.expiresAt)
	if (
		expiresAt &&
		expiresAt.getTime() <= now.getTime() + refreshExpiryMarginMs
	) {
		return true
	}

	const claims = parseJwtClaims(session.accessToken)
	const exp = claims && typeof claims.exp === "number" ? claims.exp : undefined
	if (
		typeof exp === "number" &&
		exp * 1000 <= now.getTime() + refreshExpiryMarginMs
	) {
		return true
	}

	const lastRefresh = parseIsoDate(session.lastRefresh)
	return lastRefresh
		? lastRefresh.getTime() <= now.getTime() - refreshIntervalMs
		: false
}

const toJsonResponse = (body: unknown, status = 200): Response =>
	new Response(JSON.stringify(body), {
		status,
		headers: jsonHeaders,
	})

const toErrorResponse = (
	code: string,
	message: string,
	status: number,
): Response =>
	toJsonResponse(
		{
			error: {
				code,
				message,
			},
		},
		status,
	)

const toSession = (
	token: OpenAIOAuthTokenResponse,
	options: {
		previousRefreshToken?: string
		now: Date
	},
): OpenAIOAuthSession => {
	const accountId =
		token.accountId ??
		deriveAccountId(token.idToken) ??
		deriveAccountId(token.accessToken)

	if (!accountId) {
		throw new Error(
			"ChatGPT account id not found in OpenAI OAuth token response.",
		)
	}

	return {
		accessToken: token.accessToken,
		accountId,
		idToken: token.idToken,
		refreshToken: token.refreshToken ?? options.previousRefreshToken,
		expiresAt:
			typeof token.expiresIn === "number"
				? new Date(options.now.getTime() + token.expiresIn * 1000).toISOString()
				: undefined,
		lastRefresh: options.now.toISOString(),
	}
}

export const exchangeCode = async (
	input: ExchangeCodeInput,
	options: ExchangeCodeOptions = {},
): Promise<OpenAIOAuthSession> => {
	const token = await exchangeOpenAIOAuthCode({
		code: input.code,
		codeVerifier: input.codeVerifier,
		redirectUri: input.redirectUri,
		clientId: options.clientId,
		issuer: options.issuer,
		tokenUrl: options.tokenUrl,
		fetch: options.fetch,
		signal: input.signal,
	})
	return toSession(token, {
		now: (options.now ?? (() => new Date()))(),
	})
}

export const refreshSession = async (
	input: RefreshSessionInput,
	options: RefreshSessionOptions = {},
): Promise<OpenAIOAuthSession> => {
	const token = await refreshOpenAIOAuthTokens({
		refreshToken: input.refreshToken,
		clientId: options.clientId,
		issuer: options.issuer,
		tokenUrl: options.tokenUrl,
		fetch: options.fetch,
		signal: input.signal,
	})
	return toSession(token, {
		previousRefreshToken: input.refreshToken,
		now: (options.now ?? (() => new Date()))(),
	})
}

const readJsonObjectFromText = (bodyText: string): Record<string, unknown> => {
	let parsed: unknown
	try {
		parsed = JSON.parse(bodyText)
	} catch {
		throw new Error("Request body must be valid JSON.")
	}

	if (!isRecord(parsed)) {
		throw new Error("Request body must be a JSON object.")
	}

	return parsed
}

const handleRelayedResponsesRequest = async (
	bodyText: string,
	options: RelayHandlerOptions,
	client: ReturnType<typeof createCodexOAuthClient>,
	signal: AbortSignal,
): Promise<Response> => {
	const body = readJsonObjectFromText(bodyText)
	if (usesServerReplayState(body)) {
		return toErrorResponse(
			"invalid_request",
			"Stateless Codex responses endpoint does not support `previous_response_id` or `item_reference`. Replay the full conversation history in `input` on each request.",
			400,
		)
	}

	const wantsStream = body.stream === true
	const upstream = await client.request("/responses", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify(
			normalizeCodexResponsesBody(body, {
				forceStream: true,
				instructions: options.instructions,
				storeResponses: options.storeResponses,
			}),
		),
		signal,
	})

	if (!upstream.ok) {
		return copyResponse(upstream)
	}

	if (wantsStream) {
		return closeResponseOnTerminalServerSentEvent(
			new Response(upstream.body, {
				status: upstream.status,
				statusText: upstream.statusText,
				headers: sseHeaders,
			}),
		)
	}

	const completed = await collectCompletedResponseFromSse(
		upstream.body ?? new ReadableStream(),
	)
	return toJsonResponse(completed)
}

export const createRelayHandler = (
	options: RelayHandlerOptions = {},
): ((request: Request) => Promise<Response>) => {
	const basePath = options.basePath ?? defaultRelayBasePath

	return async (request) => {
		try {
			if (request.method === "OPTIONS") {
				return new Response(null, { status: 204 })
			}

			const path = resolveHandlerPath(request, basePath)
			if (request.method === "GET" && (path === "/" || path === "/health")) {
				return Response.json({ ok: true })
			}

			const accessToken = getBearerToken(request)
			const accountId = request.headers.get("chatgpt-account-id") ?? undefined
			if (!accessToken || !accountId) {
				return toErrorResponse(
					"unauthorized",
					"`Authorization` and `chatgpt-account-id` headers are required.",
					401,
				)
			}

			const client = createCodexOAuthClient({
				auth: {
					accessToken,
					accountId,
				},
				fetch: options.fetch,
				headers: options.headers,
				instructions: options.instructions,
				responsesState: false,
				storeResponses: options.storeResponses,
			})
			const body =
				request.method === "GET" || request.method === "HEAD"
					? undefined
					: await request.text()

			if (request.method === "POST" && path === "/responses") {
				return handleRelayedResponsesRequest(
					body ?? "",
					options,
					client,
					request.signal,
				)
			}

			const upstream = await client.request(path, {
				method: request.method,
				headers: request.headers,
				body,
				signal: request.signal,
			})

			return closeResponseOnTerminalServerSentEvent(copyResponse(upstream))
		} catch (error) {
			return toErrorResponse(
				"upstream_error",
				error instanceof Error ? error.message : "Unexpected server error.",
				502,
			)
		}
	}
}

export const openaiCredentials = (
	options: WebOpenAIOAuthOptions = {},
): OpenAIOAuth => {
	const sessionStore = options.sessionStore ?? getDefaultSessionStore()
	const now = options.now ?? (() => new Date())
	const shouldRefresh = options.refresh ?? true

	return {
		kind: "openai-oauth",
		baseURL: options.baseURL,
		fetch: options.fetch,
		headers: options.headers,
		instructions: options.instructions,
		openAIBaseURL: options.openAIBaseURL,
		relay: options.relay ?? defaultRelayBasePath,
		storeResponses: options.storeResponses,
		getSession: async () => {
			const session = await sessionStore.get()
			if (
				!session ||
				!shouldRefresh ||
				!session.refreshToken ||
				!shouldRefreshSession(session, now())
			) {
				return session
			}

			const refreshed = await refreshSession(
				{
					refreshToken: session.refreshToken,
				},
				options,
			)
			await sessionStore.set(refreshed)
			return refreshed
		},
		refreshSession: async () => {
			const session = await sessionStore.get()
			if (!session?.refreshToken) {
				return session
			}
			const refreshed = await refreshSession(
				{
					refreshToken: session.refreshToken,
				},
				options,
			)
			await sessionStore.set(refreshed)
			return refreshed
		},
	}
}

const readPendingLogin = (): PendingLogin | undefined => {
	const browserWindow = assertBrowserWindow()
	try {
		const value = browserWindow.sessionStorage.getItem(pendingLoginKey)
		return value ? (JSON.parse(value) as PendingLogin) : undefined
	} catch {
		return undefined
	}
}

const writePendingLogin = (pending: PendingLogin): void => {
	assertBrowserWindow().sessionStorage.setItem(
		pendingLoginKey,
		JSON.stringify(pending),
	)
}

const clearPendingLogin = (): void => {
	assertBrowserWindow().sessionStorage.removeItem(pendingLoginKey)
}

const getCurrentRelativeUrl = (): string => {
	const browserWindow = assertBrowserWindow()
	return `${browserWindow.location.pathname}${browserWindow.location.search}${browserWindow.location.hash}`
}

const getDefaultRedirectUri = (callbackPath: string): string =>
	new URL(callbackPath, assertBrowserWindow().location.origin).toString()

export const startLogin = async (
	options: StartLoginOptions = {},
): Promise<OpenAIOAuthRequest> => {
	const browserWindow = assertBrowserWindow()
	const redirectUri =
		options.redirectUri ??
		getDefaultRedirectUri(options.callbackPath ?? "/auth/callback")
	const request = await createOpenAIOAuthRequest({
		clientId: options.clientId,
		issuer: options.issuer,
		scope: options.scope,
		state: options.state,
		codeVerifier: options.codeVerifier,
		originator: options.originator,
		simplifiedFlow: options.simplifiedFlow,
		idTokenAddOrganizations: options.idTokenAddOrganizations,
		extraParams: options.extraParams,
		redirectUri,
	})

	writePendingLogin({
		state: request.state,
		codeVerifier: request.codeVerifier,
		redirectUri: request.redirectUri,
		returnTo: options.returnTo ?? getCurrentRelativeUrl(),
	})

	if (options.openMode === "popup") {
		const popup = browserWindow.open(
			request.authorizationUrl,
			"_blank",
			"popup,width=520,height=720",
		)
		if (!popup) {
			throw new Error("The ChatGPT login popup was blocked.")
		}
		return request
	}

	browserWindow.location.assign(request.authorizationUrl)
	return request
}

export const completeLogin = async (
	options: CompleteLoginOptions = {},
): Promise<OpenAIOAuthSession | null> => {
	const browserWindow = assertBrowserWindow()
	const url = new URL(options.url ?? browserWindow.location.href)
	const oauthError = url.searchParams.get("error")
	const code = url.searchParams.get("code")
	const callbackState = url.searchParams.get("state")
	const sessionStore = options.sessionStore ?? getDefaultSessionStore()

	if (!oauthError && !code) {
		return null
	}

	const pending = readPendingLogin()
	if (!pending) {
		const existingSession = await sessionStore.get()
		if (existingSession) {
			browserWindow.history.replaceState(null, "", "/")
			return existingSession
		}
	}

	if (oauthError) {
		throw new Error(
			url.searchParams.get("error_description") ??
				`OpenAI OAuth returned ${oauthError}.`,
		)
	}

	if (!pending || !callbackState || pending.state !== callbackState) {
		throw new Error("OpenAI OAuth callback state did not match.")
	}

	if (!code) {
		throw new Error("OpenAI OAuth callback did not include a code.")
	}

	const session = await exchangeCode(
		{
			code,
			codeVerifier: pending.codeVerifier,
			redirectUri: pending.redirectUri,
		},
		options,
	)
	await sessionStore.set(session)
	clearPendingLogin()
	browserWindow.history.replaceState(null, "", pending.returnTo || "/")
	return session
}

export const logout = async (options: LogoutOptions = {}): Promise<void> => {
	try {
		clearPendingLogin()
	} catch {}
	await (options.sessionStore ?? getDefaultSessionStore()).clear()
}
