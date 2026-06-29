# @openai-oauth/react

React login UI, browser session storage, and session-source re-exports.

## Quickstart

```tsx
import { SignInWithChatGPT } from "@openai-oauth/react";

export function Connect() {
	return <SignInWithChatGPT />;
}
```

No app route is required for login. The hook creates the authorization URL,
stores PKCE/state in `sessionStorage`, exchanges the callback code directly, and
stores the resulting session in the browser session store.

`SignInWithChatGPT` renders a white OpenAI-style sign-in button. After sign-in,
it becomes a disconnect button. Use `useSignInWithChatGPT()` for custom
signed-in UI.

Browser model calls need a same-origin relay because ChatGPT blocks direct
browser CORS. For Next App Router:

```ts
// app/api/openai-oauth/[...openai]/route.ts
export { GET, POST, OPTIONS } from "@openai-oauth/react/next";
```

## AI SDK

```ts
import { createOpenAIOAuth } from "@openai-oauth/ai-sdk";
import { openaiCredentials } from "@openai-oauth/react";
import { generateText } from "ai";

const openai = createOpenAIOAuth(openaiCredentials());

await generateText({
	model: openai("gpt-5.4"),
	prompt: "Reply with exactly: hello",
});
```

## Hook

```tsx
import { useSignInWithChatGPT } from "@openai-oauth/react";

const login = useSignInWithChatGPT();
```

Returns:

```ts
type UseSignInWithChatGPTReturn = SignInWithChatGPTState & {
	isSignedIn: boolean;
	login(): Promise<void>;
	logout(): Promise<void>;
	refresh(): Promise<OpenAIOAuthSession | null>;
	reset(): void;
};
```

State statuses:

```ts
"checking" | "signed-out" | "starting" | "redirecting" | "signed-in" | "error"
```

## Session Store

```ts
import { createSessionStore } from "@openai-oauth/react";

const sessionStore = createSessionStore();
```

The default store persists encrypted session in IndexedDB. Apps can provide
their own store:

```ts
type SessionStore = {
	get(): Promise<OpenAIOAuthSession | null>;
	set(session: OpenAIOAuthSession): Promise<void>;
	clear(): Promise<void>;
};
```

## Auth Handle

```ts
import { openaiCredentials } from "@openai-oauth/react";

const auth = openaiCredentials();
```

Returns:

```ts
type OpenAIOAuth = {
	kind: "openai-oauth";
	getSession(): Promise<OpenAIOAuthSession | null>;
	refreshSession(): Promise<OpenAIOAuthSession | null>;
	baseURL?: string;
	fetch?: typeof fetch;
	headers?: Record<string, string>;
	instructions?: string;
	openAIBaseURL?: string;
	relay?: string | false;
	storeResponses?: boolean;
};
```

`openaiCredentials()` defaults to the relay path `/api/openai-oauth`. Use
`openaiCredentials({ relay: "/api/custom" })` if you mount the relay elsewhere.
