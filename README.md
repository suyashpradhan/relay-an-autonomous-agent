# Relay

Relay is a desktop-first demonstration of an autonomous scheduling agent. The
model selects one narrow tool at a time, deterministic TypeScript code applies
or rejects the action, and only the validator can approve a repaired workday.

## Requirements

- Node.js `>=22.13.0`
- npm
- An OpenAI API key for live repair runs

## Local setup

```bash
npm install
cp .env.example .env.local
```

Set `OPENAI_API_KEY` in `.env.local`. `OPENAI_MODEL` is optional and defaults to
the model shown in `.env.example`. The key is read only by the server-side repair
route and is never sent to the browser.

Start development:

```bash
npm run dev
```

Create and run a production build:

```bash
npm run build
npm start
```

## Verification

```bash
npm run typecheck
npm run lint
npm test
```

The automated controller test uses deterministic model decisions and does not
require an API key. A real `OPENAI_API_KEY` is required to verify a live repair
from the UI.

## Google Calendar read-only import

Relay can import timed events from the signed-in user's primary Google Calendar
for one selected day. Imported events become fixed Relay meetings. The import
does not create, update, or delete Google Calendar events, and all-day events are
ignored. Demo and manual schedule modes continue to work without Google login.

In Google Cloud:

1. Enable the Google Calendar API.
2. Configure the OAuth consent screen.
3. Create an OAuth client with application type **Web application**.
4. Add the Calendar read-only scope:
   `https://www.googleapis.com/auth/calendar.readonly`.
5. Add the appropriate authorized redirect URIs exactly as written:

```text
http://localhost:3000/api/google-calendar/callback
https://relay-autonomous-workday.suyashpradhan.chatgpt.site/api/google-calendar/callback
```

For local development, set:

```text
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:3000/api/google-calendar/callback
GOOGLE_OAUTH_COOKIE_SECRET=... # optional but recommended
```

For the deployed site, use the HTTPS redirect URI above in
`GOOGLE_REDIRECT_URI`. Generate `GOOGLE_OAUTH_COOKIE_SECRET` as a long random
value and store it as a secret. Do not commit any real credentials.

`GOOGLE_OAUTH_COOKIE_SECRET` is created by you; Google does not provide it.
Generate one with `openssl rand -base64 32`. If it is omitted, Relay derives a
separate cookie-encryption key from `GOOGLE_CLIENT_SECRET`.

If Google shows `Error 401: invalid_client` or “The OAuth client was not found,”
verify that `GOOGLE_CLIENT_ID` is the OAuth **Web application Client ID**, not
the Google Cloud project ID. It normally ends in `.apps.googleusercontent.com`.
Also confirm that the deployed runtime has the current value and that the OAuth
client has not been deleted.

OAuth state and the short-lived access token are encrypted in HTTP-only cookies.
They are never available to browser JavaScript. The access-token cookie is
deleted immediately after the one-day import succeeds or fails.

## Architecture

- `app/` — Relay screens and server-side repair API
- `components/relay/` — presentational workspace, execution, results, and replay UI
- `lib/scheduling/` — domain types, scenarios, analyzer, tools, and validator
- `lib/agent/` — OpenAI tool definitions and autonomous controller
- `lib/ui/` — display-only adapters; no scheduling mutations
- `tests/` — deterministic controller and rendered application checks

Schedules use minutes from midnight internally. The original schedule is cloned
and preserved; the working schedule changes only when a validated deterministic
tool succeeds. Replay applies recorded successful schedule states and never
calls OpenAI.
