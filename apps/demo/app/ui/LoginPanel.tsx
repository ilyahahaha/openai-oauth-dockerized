"use client"

import { createOpenAIOAuth } from "@openai-oauth/ai-sdk"
import {
	openaiCredentials,
	SignInWithChatGPT,
	type SignInWithChatGPTState,
} from "@openai-oauth/react"
import { generateText } from "ai"
import { useState } from "react"

type RequestState =
	| {
			status: "idle"
			text: null
			error: null
	  }
	| {
			status: "requesting"
			text: null
			error: null
	  }
	| {
			status: "success"
			text: string
			error: null
	  }
	| {
			status: "error"
			text: null
			error: string
	  }

const requestModel = "gpt-5.4-mini"
const requestInput = "hi"
const openai = createOpenAIOAuth(openaiCredentials())

const initialAuthState: SignInWithChatGPTState = {
	status: "checking",
	session: null,
	error: null,
}

const initialRequestState: RequestState = {
	status: "idle",
	text: null,
	error: null,
}

export function LoginPanel() {
	const [authState, setAuthState] =
		useState<SignInWithChatGPTState>(initialAuthState)
	const [requestState, setRequestState] =
		useState<RequestState>(initialRequestState)
	const isSignedIn = authState.status === "signed-in"
	const isRequesting = requestState.status === "requesting"

	const handleAuthStateChange = (next: SignInWithChatGPTState) => {
		setAuthState(next)
		if (next.status !== "signed-in") {
			setRequestState(initialRequestState)
		}
	}

	const handleMakeRequest = async () => {
		setRequestState({
			status: "requesting",
			text: null,
			error: null,
		})

		try {
			const result = await generateText({
				model: openai(requestModel),
				prompt: requestInput,
			})

			setRequestState({
				status: "success",
				text: result.text,
				error: null,
			})
		} catch (error) {
			setRequestState({
				status: "error",
				text: null,
				error:
					error instanceof Error
						? error.message
						: "The request failed unexpectedly.",
			})
		}
	}

	return (
		<main className="demo">
			<SignInWithChatGPT onStateChange={handleAuthStateChange} />

			<button
				className="requestButton"
				disabled={!isSignedIn || isRequesting}
				onClick={() => void handleMakeRequest()}
				type="button"
			>
				{isRequesting ? "Requesting..." : "Make request"}
			</button>

			{authState.status === "error" ? (
				<p className="message" role="alert">
					{authState.error.message}
				</p>
			) : null}

			{requestState.status === "success" ? (
				<output className="response">{requestState.text}</output>
			) : null}

			{requestState.status === "error" ? (
				<p className="message" role="alert">
					{requestState.error}
				</p>
			) : null}
		</main>
	)
}
