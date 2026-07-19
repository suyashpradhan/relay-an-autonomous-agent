"use client";

import posthog from "posthog-js";
import { PostHogProvider as Provider } from "posthog-js/react";
import { useEffect, type ReactNode } from "react";
import { POSTHOG_HOST, POSTHOG_KEY } from "./config";

export function PostHogProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (posthog.__loaded) return;
    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      capture_pageview: true,
      capture_pageleave: true,
      person_profiles: "identified_only",
    });
  }, []);

  return <Provider client={posthog}>{children}</Provider>;
}

export function captureRelayEvent(
  event: string,
  properties?: Record<string, unknown>,
) {
  if (typeof window === "undefined") return;
  posthog.capture(event, properties);
}
