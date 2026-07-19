import posthog from "posthog-js";
import { POSTHOG_KEY } from "./config";

type EventProperties = Record<
  string,
  boolean | number | string | null | undefined
>;

export function captureRelayEvent(
  event: string,
  properties: EventProperties = {},
): void {
  if (typeof window === "undefined" || !POSTHOG_KEY) {
    return;
  }
  posthog.capture(event, properties);
}
