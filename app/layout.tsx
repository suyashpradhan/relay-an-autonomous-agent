import type { Metadata } from "next";
import { PostHogProvider } from "../lib/analytics/posthog-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Relay — Autonomous workday repair",
  description:
    "Watch Relay make practical changes to repair an overloaded workday.",
  icons: {
    icon: "/brand/relay-mark.png",
    apple: "/brand/relay-mark.png",
  },
  openGraph: {
    title: "Relay — Autonomous workday repair",
    description: "AI agent for your workday.",
    images: ["/brand/relay-logo-full.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Relay — Autonomous workday repair",
    description: "AI agent for your workday.",
    images: ["/brand/relay-logo-full.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{const saved=localStorage.getItem("relay-theme");const dark=saved?saved==="dark":matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.dataset.theme=dark?"dark":"light"}catch{}`,
          }}
        />
      </head>
      <body>
        <PostHogProvider>{children}</PostHogProvider>
      </body>
    </html>
  );
}
