import type { Metadata } from "next";
import { PostHogProvider } from "../lib/analytics/posthog";
import "./globals.css";

export const metadata: Metadata = {
  title: "Relay — Autonomous workday repair",
  description:
    "Watch Relay make practical changes to repair an overloaded workday.",
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
