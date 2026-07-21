# Relay

Relay demonstrates an autonomous agent repairing an overloaded workday.

The model does not generate or directly edit a schedule. It selects one narrow
tool at a time, deterministic TypeScript code accepts or rejects each action,
and an independent validator decides whether the day has been repaired.

## What Relay includes

- Three built-in demo scenarios
- Manual schedule creation
- Read-only Google Calendar import
- Deterministic schedule analysis and validation
- OpenAI tool-calling agent with visible retries
- Before-and-after schedule comparison
- Replay from recorded tool results without another model call
- Optional PostHog product analytics

Google Calendar imports timed events from the selected day as fixed meetings.
Imported meetings cannot be moved, and Relay never writes to Google Calendar.
Users can add flexible tasks after importing their meetings.

## Requirements

- Node.js `>=22.13.0`
- npm
- An OpenAI API key for live repair runs

## Local setup

Install dependencies and create a local environment file:

```bash
npm install
cp .env.example .env.local
```

Set at least:

```text
OPENAI_API_KEY=your_server_side_api_key
```

Start the application:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment variables

```text
OPENAI_API_KEY=your_server_side_api_key
OPENAI_MODEL=gpt-5.6-luna

GOOGLE_CLIENT_ID=your_google_oauth_client_id
GOOGLE_CLIENT_SECRET=your_google_oauth_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/google-calendar/callback
GOOGLE_OAUTH_COOKIE_SECRET=your_long_random_secret

NEXT_PUBLIC_POSTHOG_KEY=your_posthog_project_key
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
```

Only `OPENAI_API_KEY` is required for demo and manual repair runs. Google
variables are required only for Calendar import. PostHog variables are optional.

Keep `.env.local` private. Do not commit API keys, OAuth secrets, cookie secrets,
or personal PostHog keys.

## Google Calendar setup

1. Enable the Google Calendar API in Google Cloud.
2. Configure the OAuth consent screen.
3. Create an OAuth client with application type **Web application**.
4. Add the scope:
   `https://www.googleapis.com/auth/calendar.readonly`
5. Add this authorized redirect URI:

```text
http://localhost:3000/api/google-calendar/callback
```

Use the OAuth Web application Client ID, which normally ends in
`.apps.googleusercontent.com`.

Create the cookie secret locally:

```bash
openssl rand -base64 32
```

Relay stores OAuth state and the short-lived access token in encrypted,
HTTP-only cookies. The access-token cookie is deleted after the import succeeds
or fails. All-day events are skipped.

## Commands

```bash
npm run dev
npm run typecheck
npm run lint
npm test
npm run build
npm start
```

`npm test` runs the deterministic tests and a production build. Unit tests use
mocked model responses and do not consume OpenAI API credits.

## Architecture

```text
Goal
→ model selects one tool
→ Zod validates the arguments
→ deterministic TypeScript executes the tool
→ the model observes success or rejection
→ the model chooses the next action
→ deterministic validation controls completion
```

- `app/`: application screens and server routes
- `components/relay/`: schedule, execution, results, and replay UI
- `lib/scheduling/`: domain types, scenarios, analyzer, tools, and validator
- `lib/agent/`: OpenAI tool definitions and agent controller
- `lib/ui/`: display-only adapters and human-friendly copy
- `tests/`: scheduling, controller, import, and rendered-output checks

Schedules use minutes from midnight internally. Relay preserves the original
schedule separately and changes the working schedule only after a deterministic
tool succeeds. Rejected actions never mutate schedule state.
