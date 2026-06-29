# @openai-oauth/core

Lowest-level OpenAI OAuth and Codex transport primitives.

## Node/CLI Entry

```ts
import { createOpenAIOAuthTransport } from "@openai-oauth/core";

const transport = createOpenAIOAuthTransport({
	authFilePath: "~/.codex/auth.json",
});
```

## Runtime Entry

```ts
import {
	createOpenAIOAuthTransport,
	createOpenAIOAuthRequest,
} from "@openai-oauth/core";

const request = await createOpenAIOAuthRequest({
	redirectUri: "https://app.example.com/auth/callback",
});

const transport = createOpenAIOAuthTransport({
	auth: async () => session,
});
```

Use explicit `auth` when you need a runtime-safe transport. The local auth-file
helpers are Node-only and are used by `@openai-oauth/local` and the CLI.
