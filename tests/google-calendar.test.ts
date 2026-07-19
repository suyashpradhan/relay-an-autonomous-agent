import assert from "node:assert/strict";
import test from "node:test";
import { normalizeGoogleEvents } from "../lib/integrations/google-calendar";

test("Google Calendar import keeps only timed events and normalizes fixed meetings", () => {
  const meetings = normalizeGoogleEvents(
    [
      {
        id: "timed",
        summary: "Design review",
        status: "confirmed",
        start: { dateTime: "2026-07-21T10:00:00+05:30" },
        end: { dateTime: "2026-07-21T11:00:00+05:30" },
      },
      {
        id: "all-day",
        summary: "Company holiday",
        start: { date: "2026-07-21" },
        end: { date: "2026-07-22" },
      },
      {
        id: "cancelled",
        summary: "Cancelled meeting",
        status: "cancelled",
        start: { dateTime: "2026-07-21T12:00:00+05:30" },
        end: { dateTime: "2026-07-21T12:30:00+05:30" },
      },
    ],
    "2026-07-21",
    "Asia/Kolkata",
  );

  assert.deepEqual(meetings, [
    {
      kind: "meeting",
      id: "google-timed",
      title: "Design review",
      start: 600,
      end: 660,
      fixed: true,
    },
  ]);
});
