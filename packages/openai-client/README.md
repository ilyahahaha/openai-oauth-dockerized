# @openai-oauth/openai-client

[Docs](https://github.com/EvanZhouDev/openai-oauth#client-adapters) | [GitHub](https://github.com/EvanZhouDev/openai-oauth) | [npm](https://www.npmjs.com/package/@openai-oauth/openai-client)

Use OpenAI OAuth credentials with the OpenAI JavaScript SDK.

```bash
npm i @openai-oauth/openai-client openai
```

Quickstart:

```ts
import { createOpenAIOptions } from "@openai-oauth/openai-client";
import { openaiCredentials } from "@openai-oauth/local";
import OpenAI from "openai";

const client = new OpenAI(createOpenAIOptions(openaiCredentials()));
```

## Package Notes

`@openai-oauth/openai-client` turns an OpenAI OAuth credential source into options for `new OpenAI()`.

It works with any credential source:

```ts
import { openaiCredentials } from "@openai-oauth/react"; // or "@openai-oauth/local"

const client = new OpenAI(createOpenAIOptions(openaiCredentials()));
```

The default `apiKey` is the placeholder string `openai-oauth`. Authentication is handled by the custom `fetch` implementation.

Useful options:

```ts
type CreateOpenAIClientOptions = {
	apiKey?: string;
	baseURL?: string;
	defaultHeaders?: HeadersInit;
	dangerouslyAllowBrowser?: boolean;
};
```

Output:

```ts
type OpenAIClientOptions = {
	apiKey: string;
	baseURL: string;
	fetch: typeof fetch;
	defaultHeaders?: HeadersInit;
	dangerouslyAllowBrowser?: boolean;
};
```

## More

[Learn more in the openai-oauth README.](https://github.com/EvanZhouDev/openai-oauth#client-adapters)
