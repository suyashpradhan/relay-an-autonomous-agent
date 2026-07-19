import { NextResponse } from "next/server";
import {
  cleanEnvironmentValue,
  decryptCookie,
  encryptCookie,
  GOOGLE_OAUTH_STATE_COOKIE,
  GOOGLE_TOKEN_COOKIE,
  type GoogleOAuthState,
  type GoogleTokenBundle,
} from "../../../../lib/integrations/google-calendar";

export const runtime = "nodejs";

interface GoogleTokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

function appRedirect(request: Request, status: string, date?: string): URL {
  const url = new URL("/", request.url);
  url.searchParams.set("calendar", status);
  if (date) url.searchParams.set("date", date);
  return url;
}

export async function GET(request: Request): Promise<Response> {
  const requestUrl = new URL(request.url);
  if (requestUrl.searchParams.get("error")) {
    const response = NextResponse.redirect(appRedirect(request, "cancelled"));
    response.cookies.delete(GOOGLE_OAUTH_STATE_COOKIE);
    return response;
  }

  const code = requestUrl.searchParams.get("code");
  const returnedState = requestUrl.searchParams.get("state");
  const stateCookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${GOOGLE_OAUTH_STATE_COOKIE}=`))
    ?.slice(GOOGLE_OAUTH_STATE_COOKIE.length + 1);
  if (!code || !returnedState || !stateCookie) {
    return NextResponse.redirect(appRedirect(request, "failed"));
  }

  let oauthState: GoogleOAuthState;
  try {
    oauthState = decryptCookie<GoogleOAuthState>(
      decodeURIComponent(stateCookie),
    );
  } catch {
    return NextResponse.redirect(appRedirect(request, "failed"));
  }
  if (oauthState.state !== returnedState) {
    return NextResponse.redirect(appRedirect(request, "failed"));
  }

  const clientId = cleanEnvironmentValue("GOOGLE_CLIENT_ID");
  const clientSecret = cleanEnvironmentValue("GOOGLE_CLIENT_SECRET");
  const redirectUri = cleanEnvironmentValue("GOOGLE_REDIRECT_URI");
  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.redirect(appRedirect(request, "not_configured"));
  }

  let tokenPayload: GoogleTokenResponse;
  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
      cache: "no-store",
    });
    tokenPayload = (await tokenResponse.json()) as GoogleTokenResponse;
    if (!tokenResponse.ok) {
      return NextResponse.redirect(
        appRedirect(request, "failed", oauthState.date),
      );
    }
  } catch {
    return NextResponse.redirect(
      appRedirect(request, "failed", oauthState.date),
    );
  }
  if (!tokenPayload.access_token) {
    return NextResponse.redirect(
      appRedirect(request, "failed", oauthState.date),
    );
  }

  const token: GoogleTokenBundle = {
    accessToken: tokenPayload.access_token,
    expiresAt: Date.now() + (tokenPayload.expires_in ?? 3600) * 1000 - 30_000,
  };
  const destination = appRedirect(request, "connected", oauthState.date);
  destination.searchParams.set("timeZone", oauthState.timeZone);
  const response = NextResponse.redirect(destination);
  response.cookies.delete(GOOGLE_OAUTH_STATE_COOKIE);
  response.cookies.set(GOOGLE_TOKEN_COOKIE, encryptCookie(token), {
    httpOnly: true,
    sameSite: "lax",
    secure: requestUrl.protocol === "https:",
    maxAge: 60 * 60,
    path: "/",
  });
  return response;
}
