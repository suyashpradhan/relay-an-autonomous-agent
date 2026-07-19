import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import type { DaySchedule, FixedMeeting } from "../scheduling/types";

export const GOOGLE_CALENDAR_READONLY_SCOPE =
  "https://www.googleapis.com/auth/calendar.readonly";

export const GOOGLE_OAUTH_STATE_COOKIE = "relay_google_oauth_state";
export const GOOGLE_TOKEN_COOKIE = "relay_google_calendar_token";

export interface GoogleOAuthState {
  state: string;
  date: string;
  timeZone: string;
}

export interface GoogleTokenBundle {
  accessToken: string;
  expiresAt: number;
}

interface GoogleCalendarEvent {
  id?: string;
  summary?: string;
  status?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
}

interface GoogleEventsResponse {
  items?: GoogleCalendarEvent[];
  nextPageToken?: string;
  error?: { message?: string };
}

function cookieKey(): Buffer {
  const secret = process.env.GOOGLE_OAUTH_COOKIE_SECRET;
  if (!secret) throw new Error("GOOGLE_OAUTH_COOKIE_SECRET is not configured.");
  return createHash("sha256").update(secret).digest();
}

export function encryptCookie(value: object): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", cookieKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64url");
}

export function decryptCookie<T>(value: string): T {
  const packed = Buffer.from(value, "base64url");
  if (packed.length < 29)
    throw new Error("The secure session cookie is invalid.");
  const iv = packed.subarray(0, 12);
  const tag = packed.subarray(12, 28);
  const encrypted = packed.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", cookieKey(), iv);
  decipher.setAuthTag(tag);
  return JSON.parse(
    Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
      "utf8",
    ),
  ) as T;
}

function dateParts(date: Date, timeZone: string): Record<string, number> {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
}

function zonedMidnight(date: string, timeZone: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  const desiredUtc = Date.UTC(year, month - 1, day);
  let estimate = desiredUtc;
  for (let iteration = 0; iteration < 2; iteration += 1) {
    const parts = dateParts(new Date(estimate), timeZone);
    const representedUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    estimate += desiredUtc - representedUtc;
  }
  return new Date(estimate);
}

function nextDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return next.toISOString().slice(0, 10);
}

function minutesOnSelectedDay(
  dateTime: string,
  selectedDate: string,
  timeZone: string,
  edge: "start" | "end",
): number {
  const parts = dateParts(new Date(dateTime), timeZone);
  const eventDate = `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
  if (eventDate < selectedDate) return 0;
  if (eventDate > selectedDate) return 1440;
  const minutes = parts.hour * 60 + parts.minute;
  return edge === "end" && minutes === 0 ? 1440 : minutes;
}

export function normalizeGoogleEvents(
  events: GoogleCalendarEvent[],
  selectedDate: string,
  timeZone: string,
): FixedMeeting[] {
  return events
    .filter(
      (event) =>
        event.status !== "cancelled" &&
        Boolean(event.start?.dateTime) &&
        Boolean(event.end?.dateTime),
    )
    .map((event, index): FixedMeeting | null => {
      const start = minutesOnSelectedDay(
        event.start!.dateTime!,
        selectedDate,
        timeZone,
        "start",
      );
      const end = minutesOnSelectedDay(
        event.end!.dateTime!,
        selectedDate,
        timeZone,
        "end",
      );
      if (end <= start) return null;
      return {
        kind: "meeting",
        id: `google-${event.id ?? index}`,
        title: event.summary?.trim() || "Busy",
        start,
        end,
        fixed: true,
      };
    })
    .filter((event): event is FixedMeeting => event !== null)
    .sort((left, right) => left.start - right.start || left.end - right.end);
}

export async function importPrimaryCalendarDay(
  token: GoogleTokenBundle,
  selectedDate: string,
  timeZone: string,
): Promise<DaySchedule> {
  if (Date.now() >= token.expiresAt) {
    throw new Error("Google Calendar access expired. Please connect again.");
  }

  const timeMin = zonedMidnight(selectedDate, timeZone).toISOString();
  const timeMax = zonedMidnight(nextDate(selectedDate), timeZone).toISOString();
  const events: GoogleCalendarEvent[] = [];
  let pageToken: string | undefined;

  do {
    const query = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: "true",
      orderBy: "startTime",
      showDeleted: "false",
      maxResults: "250",
    });
    if (pageToken) query.set("pageToken", pageToken);

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${query}`,
      {
        headers: { Authorization: `Bearer ${token.accessToken}` },
        cache: "no-store",
      },
    );
    const payload = (await response.json()) as GoogleEventsResponse;
    if (!response.ok) {
      throw new Error(
        payload.error?.message || "Google Calendar could not be imported.",
      );
    }
    events.push(...(payload.items ?? []));
    pageToken = payload.nextPageToken;
  } while (pageToken);

  return {
    id: `google-calendar-${selectedDate}`,
    title: "My Google Calendar Day",
    date: selectedDate,
    workingHours: { start: 9 * 60, end: 17 * 60 },
    items: normalizeGoogleEvents(events, selectedDate, timeZone),
  };
}
