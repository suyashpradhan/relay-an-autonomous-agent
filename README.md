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
