# @openai-oauth/web

[Docs](https://github.com/EvanZhouDev/openai-oauth#react-component) | [GitHub](https://github.com/EvanZhouDev/openai-oauth) | [npm](https://www.npmjs.com/package/@openai-oauth/web)

Framework-neutral browser credentials, encrypted browser storage, and model relay helpers.

```bash
npm i @openai-oauth/web
```

Most React apps should use `@openai-oauth/react`, which depends on this package and re-exports `openaiCredentials()`.

```ts
import { openaiCredentials } from "@openai-oauth/web";

const credentials = openaiCredentials();
```

## Package Notes

`@openai-oauth/web` is the lower-level web package. Use it when you need framework-neutral primitives instead of the React button and hook.

### Browser Credentials

```ts
const credentials = openaiCredentials();
```

Useful options:

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

`openaiCredentials()` reads the browser session store and refreshes with the stored refresh token when needed.

`relay` defaults to `/api/openai-oauth`. SDK adapters use that relay for browser model calls.

`openaiCredentials()` returns an `OpenAIOAuth` credential source:

```ts
type OpenAIOAuth = {
	kind: "openai-oauth";
	getSession(): Promise<OpenAIOAuthSession | null>;
	refreshSession(): Promise<OpenAIOAuthSession | null>;
};
```

### Session Store

```ts
import { createSessionStore } from "@openai-oauth/web";

const sessionStore = createSessionStore();
```

The default store persists the session in IndexedDB and encrypts each payload with a non-extractable WebCrypto AES-GCM key.

Apps can provide their own store:

```ts
type SessionStore = {
	get(): Promise<OpenAIOAuthSession | null>;
	set(session: OpenAIOAuthSession): Promise<void>;
	clear(): Promise<void>;
};
```

### Model Relay

```ts
import { createRelayHandler } from "@openai-oauth/web";

const handler = createRelayHandler();
```

The relay reads `Authorization` and `chatgpt-account-id` from the browser request, forwards the model call to ChatGPT/Codex, and does not store credentials.

Useful options:

```ts
type RelayHandlerOptions = {
	basePath?: string;
	fetch?: typeof fetch;
	headers?: Record<string, string>;
	instructions?: string;
	storeResponses?: boolean;
};
```

The relay handler has this shape:

```ts
type OpenAIOAuthHandler = (request: Request) => Promise<Response>;
```

### Direct Token Exchange

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

## More

[Learn more in the openai-oauth README.](https://github.com/EvanZhouDev/openai-oauth#react-component)
