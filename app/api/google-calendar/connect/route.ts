import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  cleanEnvironmentValue,
  encryptCookie,
  GOOGLE_CALENDAR_READONLY_SCOPE,
  GOOGLE_OAUTH_STATE_COOKIE,
  type GoogleOAuthState,
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
    return NextResponse.redirect(
      new URL("/?calendar=invalid_request", request.url),
    );
  }

  const clientId = cleanEnvironmentValue("GOOGLE_CLIENT_ID");
  const redirectUri = cleanEnvironmentValue("GOOGLE_REDIRECT_URI");
  if (!clientId || !redirectUri) {
    return NextResponse.redirect(
      new URL("/?calendar=not_configured", request.url),
    );
  }
  if (!clientId.endsWith(".apps.googleusercontent.com")) {
    return NextResponse.redirect(
      new URL("/?calendar=invalid_client", request.url),
    );
  }

  try {
    new Intl.DateTimeFormat("en-US", {
      timeZone: parsed.data.timeZone,
    }).format();
  } catch {
    return NextResponse.redirect(
      new URL("/?calendar=invalid_timezone", request.url),
    );
  }

  const oauthState: GoogleOAuthState = {
    state: randomBytes(24).toString("base64url"),
    date: parsed.data.date,
    timeZone: parsed.data.timeZone,
  };
  const authorizationUrl = new URL(
    "https://accounts.google.com/o/oauth2/v2/auth",
  );
  authorizationUrl.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_CALENDAR_READONLY_SCOPE,
    state: oauthState.state,
    access_type: "online",
    include_granted_scopes: "false",
    prompt: "select_account",
  }).toString();

  const response = NextResponse.redirect(authorizationUrl);
  response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, encryptCookie(oauthState), {
    httpOnly: true,
    sameSite: "lax",
    secure: requestUrl.protocol === "https:",
    maxAge: 10 * 60,
    path: "/",
  });
  return response;
}
