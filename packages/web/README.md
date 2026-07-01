# @openai-oauth/web

[Docs](https://github.com/EvanZhouDev/openai-oauth#react-component) | [GitHub](https://github.com/EvanZhouDev/openai-oauth) | [npm](https://www.npmjs.com/package/@openai-oauth/web)

Framework-neutral browser sign-in primitives for OpenAI OAuth.

```bash
npm i @openai-oauth/web
```

Most React apps should use `@openai-oauth/react`, which depends on this package and re-exports the common browser helpers.

```ts
import { openaiAuthHeaders } from "@openai-oauth/web";

await fetch("/api/chat", {
	method: "POST",
	headers: await openaiAuthHeaders(),
	body: "Hello!",
});
```

## Package Notes

`@openai-oauth/web` is the lower-level web package. Use it when you need browser primitives without React.

### Browser Session

```ts
import { createSessionStore, getSession, openaiAuthHeaders } from "@openai-oauth/web";

const sessionStore = createSessionStore();
const session = await getSession({ sessionStore });
const headers = await openaiAuthHeaders({ sessionStore });
```

`getSession()` reads the browser session store and refreshes with the stored refresh token when needed.

`openaiAuthHeaders()` returns request headers for your own app route:

```ts
const headers = await openaiAuthHeaders({
	headers: { "content-type": "application/json" },
});
```

It includes:

- `Authorization: Bearer <access token>`
- `chatgpt-account-id: <account id>`

### Server Credentials

Use `@openai-oauth/web/server` in the app route that receives those headers:

```ts
import { createOpenAIOAuth } from "@openai-oauth/ai-sdk";
import { openaiCredentials } from "@openai-oauth/web/server";
import { generateText } from "ai";

export async function POST(request: Request) {
	const openai = createOpenAIOAuth(openaiCredentials(request));

	const result = await generateText({
		model: openai("gpt-5.4-mini"),
		prompt: await request.text(),
	});

	return new Response(result.text);
}
```

`openaiCredentials(request)` reads the request headers and returns an `OpenAIOAuth` credential source for client adapters.

### Session Store

The default store persists the session in IndexedDB and encrypts each payload with a non-extractable WebCrypto AES-GCM key.

Apps can provide their own store:

```ts
type SessionStore = {
	get(): Promise<OpenAIOAuthSession | null>;
	set(session: OpenAIOAuthSession): Promise<void>;
	clear(): Promise<void>;
};
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

### Login Helpers

```ts
import { completeLogin, logout, startLogin } from "@openai-oauth/web";

await startLogin();
await completeLogin();
await logout();
```

Useful browser options:

```ts
type BrowserSessionOptions = {
	sessionStore?: SessionStore;
	clientId?: string;
	issuer?: string;
	tokenUrl?: string;
	fetch?: typeof fetch;
	refresh?: boolean;
	now?: () => Date;
};
```

Useful server options:

```ts
type WebServerOpenAIOAuthOptions = {
	baseURL?: string;
	fetch?: typeof fetch;
	headers?: Record<string, string>;
	instructions?: string;
	openAIBaseURL?: string;
	storeResponses?: boolean;
};
```

## More

[Learn more in the openai-oauth README.](https://github.com/EvanZhouDev/openai-oauth#react-component)
