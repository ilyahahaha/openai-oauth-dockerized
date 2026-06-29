import { describe, expect, test } from "vitest"
import {
	createSessionStore,
	openaiCredentials,
	SignInWithChatGPT,
	useSignInWithChatGPT,
} from "../src/index.js"

describe("@openai-oauth/react public API", () => {
	test("exports the v2 React surface", () => {
		expect(SignInWithChatGPT).toBeTypeOf("function")
		expect(useSignInWithChatGPT).toBeTypeOf("function")
		expect(createSessionStore).toBeTypeOf("function")
		expect(openaiCredentials).toBeTypeOf("function")
	})
})
