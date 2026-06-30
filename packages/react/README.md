# @openai-oauth/react

[Docs](https://github.com/EvanZhouDev/openai-oauth#react-component) | [GitHub](https://github.com/EvanZhouDev/openai-oauth) | [npm](https://www.npmjs.com/package/@openai-oauth/react)

Let your users sign in with their ChatGPT accounts.

```bash
npm i @openai-oauth/react
```

Quickstart:

```tsx
"use client";

import { SignInWithChatGPT } from "@openai-oauth/react";

export default function Page() {
	return <SignInWithChatGPT />;
}
```

## Package Notes

`SignInWithChatGPT` renders the OpenAI-style sign-in button. After sign-in, it becomes a disconnect button.

No app route is required for login. The hook creates the authorization URL, stores PKCE/state in `sessionStorage`, exchanges the callback code directly, and stores the resulting session in the browser session store.

Browser model calls need a same-origin relay because ChatGPT blocks direct browser CORS. For Next App Router:

```ts
// app/api/openai-oauth/[...openai]/route.ts
export { GET, POST, OPTIONS } from "@openai-oauth/react/next";
```

Use browser credentials with a client adapter:

```ts
import { createOpenAIOAuth } from "@openai-oauth/ai-sdk";
import { openaiCredentials } from "@openai-oauth/react";

const openai = createOpenAIOAuth(openaiCredentials());
```

Useful props:

```tsx
<SignInWithChatGPT
	onSuccess={(session) => console.log(session.accountId)}
	onError={(error) => console.error(error.message)}
	onStateChange={(state) => console.log(state.status)}
/>
```

For custom UI, use the hook:

```tsx
import { useSignInWithChatGPT } from "@openai-oauth/react";

function CustomLogin() {
	const login = useSignInWithChatGPT();

	if (login.status === "signed-in") {
		return <button onClick={() => void login.logout()}>Disconnect</button>;
	}

	return (
		<button onClick={() => void login.login()}>Sign in with ChatGPT</button>
	);
}
```

The hook returns:

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

The default browser session store persists encrypted sessions in IndexedDB. Apps can provide their own store:

```ts
import { createSessionStore } from "@openai-oauth/react";

const sessionStore = createSessionStore();

type SessionStore = {
	get(): Promise<OpenAIOAuthSession | null>;
	set(session: OpenAIOAuthSession): Promise<void>;
	clear(): Promise<void>;
};
```

`openaiCredentials()` defaults to the relay path `/api/openai-oauth`. Use `openaiCredentials({ relay: "/api/custom" })` if you mount the relay elsewhere.

Exports:

- `SignInWithChatGPT`
- `useSignInWithChatGPT`
- `openaiCredentials`
- `createSessionStore`
- `GET`, `POST`, `OPTIONS` from `@openai-oauth/react/next`

## More

[Learn more in the openai-oauth README.](https://github.com/EvanZhouDev/openai-oauth#react-component)
