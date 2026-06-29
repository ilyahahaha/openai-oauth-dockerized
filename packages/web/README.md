# @openai-oauth/web

Browser auth handle, browser session storage, direct token exchange,
and framework-neutral model relay.

React apps normally use `@openai-oauth/react`, which depends on this package and
re-exports `openaiCredentials()`.

## Auth Handle

```ts
import { openaiCredentials } from "@openai-oauth/web";

const auth = openaiCredentials();
```

Input:

```ts
type WebOpenAIOAuthOptions = {
	sessionStore?: SessionStore;
	clientId?: string;
	issuer?: string;
	tokenUrl?: string;
	fetch?: typeof fetch;
	baseURL?: string;
	headers?: Record<string, string>;
	instructions?: string;
	openAIBaseURL?: string;
	relay?: string | false;
	storeResponses?: boolean;
	refresh?: boolean;
	now?: () => Date;
};
```

Output:

```ts
type OpenAIOAuth = {
	kind: "openai-oauth";
	getSession(): Promise<OpenAIOAuthSession | null>;
	refreshSession(): Promise<OpenAIOAuthSession | null>;
};
```

`getSession()` reads the browser session store and refreshes with the stored
refresh token when needed.

`relay` defaults to `/api/openai-oauth`. SDK adapters use that relay for browser
model calls.

## Model Relay

```ts
import { createRelayHandler } from "@openai-oauth/web";

const handler = createRelayHandler();
```

Input:

```ts
type RelayHandlerOptions = {
	basePath?: string;
	fetch?: typeof fetch;
	headers?: Record<string, string>;
	instructions?: string;
	storeResponses?: boolean;
};
```

Output:

```ts
type OpenAIOAuthHandler = (request: Request) => Promise<Response>;
```

The handler reads `Authorization` and `chatgpt-account-id` from the browser
request, forwards the model call to ChatGPT/Codex, and does not store
session.

## Session Store

```ts
import { createSessionStore } from "@openai-oauth/web";

const sessionStore = createSessionStore();
```

The default store persists session in IndexedDB and encrypts each payload
with a non-extractable WebCrypto AES-GCM key.

```ts
type SessionStore = {
	get(): Promise<OpenAIOAuthSession | null>;
	set(session: OpenAIOAuthSession): Promise<void>;
	clear(): Promise<void>;
};
```

## Direct Exchange

```ts
import { exchangeCode, refreshSession } from "@openai-oauth/web";

const session = await exchangeCode({
	code,
	codeVerifier,
	redirectUri,
});

const refreshed = await refreshSession({
	refreshToken: session.refreshToken,
});
```
