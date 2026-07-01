# API Cleanup Matrix

This tracks the v2 cleanup pass that removed the browser relay API and switched web usage to request-bound credentials.

| Area | Looked at | Cleanup done |
| --- | --- | --- |
| Core runtime | `packages/core/src/runtime.ts`, `packages/core/src/index.ts`, `packages/core/test/transport.test.ts` | Removed relay transport exports and tests. Kept only the direct OpenAI OAuth transport. |
| AI SDK adapter | `packages/ai-sdk/src/provider.ts`, `packages/ai-sdk/test/provider.test.ts` | Removed relay auto-detection. `createOpenAIOAuth()` now accepts a transport or credential source only. |
| OpenAI client adapter | `packages/openai-client/src/index.ts` | Removed relay auto-detection. Adapter always creates options from a transport or credential source. |
| Web package | `packages/web/src/index.ts`, `packages/web/src/server.ts`, `packages/web/test/server.test.ts` | Replaced browser `openaiCredentials()` with `openaiAuthHeaders()`. Added server `openaiCredentials(request)` for request-bound credentials. |
| React package | `packages/react/src/index.ts`, `packages/react/src/server.ts`, `packages/react/package.json`, `packages/react/test/api.test.ts` | Re-exported browser helpers from root and server helpers from `/server`. Removed the Next route helper entrypoint. |
| Demo app | `apps/demo/app/ui/LoginPanel.tsx`, `apps/demo/app/api/chat/route.ts`, `apps/demo/package.json` | Switched demo requests through `/api/chat` using `openaiAuthHeaders()` and `openaiCredentials(request)`. Pinned `@ai-sdk/react` to the AI SDK 6 line. |
| Root docs | `README.md` | Rewrote quickstarts around dev proxy, local TypeScript credentials, and React request-bound web calls. |
| Package docs | `packages/*/README.md` | Removed stale relay references and documented the new client/server split. |
