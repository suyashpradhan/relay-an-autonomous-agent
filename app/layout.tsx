import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Relay — Autonomous workday repair",
  description:
    "Watch Relay make practical changes to repair an overloaded workday.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
