# @openai-oauth/local

Local Codex auth-file auth handle for openai-oauth.

```ts
import { openaiCredentials } from "@openai-oauth/local";
```

Use it with SDK adapters:

```ts
import { createOpenAIOAuth } from "@openai-oauth/ai-sdk";
import { openaiCredentials } from "@openai-oauth/local";

const openai = createOpenAIOAuth(openaiCredentials());
```

## API

`openaiCredentials(options?)`

Input:

```ts
type LocalOpenAIOAuthOptions = {
	authFilePath?: string;
	clientId?: string;
	issuer?: string;
	tokenUrl?: string;
	ensureFresh?: boolean;
	fetch?: typeof fetch;
	now?: () => Date;
	baseURL?: string;
	headers?: Record<string, string>;
	instructions?: string;
	openAIBaseURL?: string;
	storeResponses?: boolean;
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
