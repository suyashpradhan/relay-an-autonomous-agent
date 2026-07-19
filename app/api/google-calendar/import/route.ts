import { NextResponse } from "next/server";
import { z } from "zod";
import {
  decryptCookie,
  GOOGLE_TOKEN_COOKIE,
  importPrimaryCalendarDay,
  type GoogleTokenBundle,
} from "../../../../lib/integrations/google-calendar";

export const runtime = "nodejs";

const querySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timeZone: z.string().min(1).max(100),
});

export async function GET(request: Request): Promise<Response> {
  const requestUrl = new URL(request.url);
  const parsed = querySchema.safeParse({
    date: requestUrl.searchParams.get("date"),
    timeZone: requestUrl.searchParams.get("timeZone"),
  });
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "INVALID_REQUEST",
        message: "Choose a valid day and try again.",
      },
      { status: 400 },
    );
  }

  const tokenCookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${GOOGLE_TOKEN_COOKIE}=`))
    ?.slice(GOOGLE_TOKEN_COOKIE.length + 1);
  if (!tokenCookie) {
    return NextResponse.json(
      { error: "NOT_CONNECTED", message: "Connect Google Calendar again." },
      { status: 401 },
    );
  }

  try {
    const token = decryptCookie<GoogleTokenBundle>(
      decodeURIComponent(tokenCookie),
    );
    const schedule = await importPrimaryCalendarDay(
      token,
      parsed.data.date,
      parsed.data.timeZone,
    );
    const response = NextResponse.json({ schedule });
    response.cookies.delete(GOOGLE_TOKEN_COOKIE);
    return response;
  } catch (error) {
    const response = NextResponse.json(
      {
        error: "IMPORT_FAILED",
        message:
          error instanceof Error
            ? error.message
            : "Google Calendar could not be imported.",
      },
      { status: 502 },
    );
    response.cookies.delete(GOOGLE_TOKEN_COOKIE);
    return response;
  }
}
