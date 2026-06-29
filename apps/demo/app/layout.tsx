import type { Metadata } from "next"
import type { ReactNode } from "react"
import "./styles.css"

const siteUrl =
	process.env.NEXT_PUBLIC_SITE_URL ??
	(process.env.VERCEL_URL
		? `https://${process.env.VERCEL_URL}`
		: "http://localhost:1455")

export const metadata: Metadata = {
	metadataBase: new URL(siteUrl),
	title: "OpenAI OAuth",
	description: "Free OpenAI API access with your ChatGPT account.",
	icons: {
		icon: [
			{
				url: "/openai-oauth-logo.svg",
				type: "image/svg+xml",
			},
		],
	},
	openGraph: {
		description: "Free OpenAI API access with your ChatGPT account.",
		images: [
			{
				alt: "OpenAI OAuth",
				height: 640,
				url: "/opengraph.png",
				width: 1280,
			},
		],
		siteName: "OpenAI OAuth",
		title: "OpenAI OAuth",
		type: "website",
		url: "/",
	},
	twitter: {
		card: "summary_large_image",
		description: "Free OpenAI API access with your ChatGPT account.",
		images: [
			{
				alt: "OpenAI OAuth",
				url: "/opengraph.png",
			},
		],
		title: "OpenAI OAuth",
	},
}

export default function RootLayout({
	children,
}: Readonly<{
	children: ReactNode
}>) {
	return (
		<html lang="en">
			<body>{children}</body>
		</html>
	)
}
