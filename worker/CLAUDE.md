# balloon-prep/worker: the Ask-your-instructor backend

> **Reading protocol:** the parent [balloon-prep/CLAUDE.md](../CLAUDE.md) routes here. This file is authoritative inside this folder.

## Active to-do

1. LIVE 2026-10-20. Watch the first real student questions in Brian's hub.
2. Round 2 (2026-10-21, branch `feat/w-server`): rate limits, same-name check, verified/owner marks, problem reports, answer drafts, student deletion. **Production needs the migration applied BEFORE the deploy** (see "Production: applying a migration"), then `owner=1` (and `verified=1`) set on Brian's class.

## What this is

A Cloudflare Worker `balloon-prep-qa` on Brian's own account (https://balloon-prep-qa.brianfliesballoons.workers.dev), with a D1 database `balloon-prep-qa` (WNAM). Students join a class by its code, ask questions tied to a topic and a practice question, and the instructor answers in the hub. Anyone can send an anonymous "something is wrong" report about a question, lesson or reference card; the app owner reads them in their hub. There are no accounts. A class has a public 6-character join code and a secret hub key, and each student has a secret key on their device. Only SHA-256 hashes of the keys are stored.

## The files

| File | What it is |
|---|---|
| `src/worker.js` | The whole API (contract below). |
| `schema.sql` | The **full current** schema, for a fresh database. |
| `migrations/` | Additive-only changes for the live database, one file per round, applied by hand. `2026-10-21-round2.sql` = round 2. |
| `wrangler.toml` | `account_id` is pinned because this login also sees a client's account. |
| `.dev.vars` | **Git-ignored**, local only: `DEV_ORIGINS=http://127.0.0.1:8865,http://localhost:8765` (comma-separated extra CORS origins for `wrangler dev`). Production has no `DEV_ORIGINS`, so it allows the GitHub Pages origin only. |

## API contract

Auth: **hub** = `Authorization: Bearer <hub key>` for that class. **student** = `X-Student: <sid>.<key>`. Errors are `{error: "<friendly sentence>"}` with 400/401/403/404/409/429/500/503. CORS methods: GET, POST, DELETE, OPTIONS.

| Endpoint | Auth | What it does |
|---|---|---|
| `POST /api/classes {instructor, name?, own?:[{code,key}]}` | none, rate-limited | Creates a class → `{code, adminKey, name, instructor}`. **409** if another class already has the same instructor name (case, spaces, punctuation and accents ignored) unless `own` holds the code + hub key of one of those classes. The app sends every hub on the device as `own`. |
| `GET /api/classes/:code` | none | `{code, name, instructor, verified}` for the join screen. |
| `POST /api/classes/:code/students {name}` | none, rate-limited | Joins → `{sid, key, name, class}` (`class` includes `verified`). |
| `DELETE /api/classes/:code/students/me` | student | The student leaves: their questions, then their row, are deleted. |
| `DELETE /api/classes/:code/students/:sid` | hub | The instructor removes a student and every question they asked. 404 if that sid is not in this class. |
| `GET /api/classes/:code/questions/mine` | student | `{name, class, questions}` (never includes `draft`). |
| `POST /api/classes/:code/questions {text, topic?, qid?, picked?}` | student | Asks. 50 per student per 24 h. |
| `POST /api/classes/:code/questions/:id/seen` | student | Marks an answer seen. |
| `POST /api/classes/:code/questions/:id/answer {text}` | hub | Answers (sets answer, answered, seen=0). Unchanged. |
| `POST /api/classes/:code/questions/:id/draft {text}` | hub | Stores a suggested answer for a **waiting** question (for the Claude watchdog). Never touches answer/seen. Empty text clears it. 409 if already answered, 404 if unknown. |
| `GET /api/classes/:code/hub` | hub | `{class, students, questions, owner}`; each question carries `draft`. |
| `POST /api/reports {ref, kind, text?}` | none, rate-limited | Anonymous problem report. `ref` = `q:<question id>` · `lesson:<topic id>` · `card:<card id>`; `kind` = `wrong` · `confusing` · `typo` · `other`; `text` up to 1,000 characters. Nothing about the sender is stored. Refused (503) once 5,000 reports are waiting. |
| `GET /api/classes/:code/reports` | hub of an **owner** class | `{reports:[{id, ref, kind, text, created}]}`, newest first, up to 500. 403 for a non-owner class. |
| `DELETE /api/classes/:code/reports/:id` | hub of an owner class | Marks a report done by deleting it. |

Existing contracts are unchanged; responses only gained fields (`verified`, `owner`, `draft`), so already-open old clients keep working.

## Limits

Per IP, keyed on `sha256(salt | CF-Connecting-IP)`. The raw IP is never stored. The salt is a random value the Worker creates once in the `meta` table (`k='salt'`). `hits` rows older than 2 days are pruned on every recorded hit.

| Bucket | Per IP | Also |
|---|---|---|
| New class | 5 per hour, 20 per day | |
| Join | 60 per hour, 300 per day (a whole class on one school Wi-Fi fits) | 150 new students per class per 24 h |
| Report | 12 per hour, 50 per day | 5,000 waiting reports in total |
| Question | | 50 per student per 24 h (unchanged) |

Validation errors (400) are checked first and do not count. A refused same-name class (409) does count, which also slows name probing. Change the numbers in `RATE`, `JOINS_PER_CLASS_DAY` and `REPORTS_MAX` at the top of `worker.js`.

## Setting `verified` and `owner` (by hand only)

Neither can be set through the API. `verified=1` shows "Verified instructor" on the join screen, the ask card and the student's class line. `owner=1` gives that class's hub a Reports tab. Find the class code first (Brian's is in `~/.config/balloon-prep-qa/brian-code`), then:

```
cd <this folder>
CLOUDFLARE_ACCOUNT_ID=3053d192fbbbc176b3016b015244d07b npx wrangler@4 d1 execute balloon-prep-qa --remote --command "UPDATE classes SET verified=1, owner=1 WHERE code='<CODE>'"
```

To vouch for another instructor, set `verified=1` on their class only after confirming who they are.

## Production: applying a migration

Always apply the migration **before** deploying the Worker that needs it (the new code reads the new columns, so the old database would make it fail with "Something went wrong"). The old Worker ignores the new columns, so migrating first is safe.

```
cd <this folder>
CLOUDFLARE_ACCOUNT_ID=3053d192fbbbc176b3016b015244d07b npx wrangler@4 d1 execute balloon-prep-qa --remote --file migrations/2026-10-21-round2.sql
CLOUDFLARE_ACCOUNT_ID=3053d192fbbbc176b3016b015244d07b npx wrangler@4 deploy --config <this folder>/wrangler.toml
```

Migrations are additive only (`ALTER TABLE … ADD COLUMN`, `CREATE TABLE/INDEX IF NOT EXISTS`). `ADD COLUMN` is not idempotent: a second run stops at "duplicate column name" and changes nothing. Existing classes get their normalised name (`inorm`) filled in automatically the first time anyone creates a class.

## Local testing

```
npx wrangler@4 d1 execute balloon-prep-qa --local --persist-to <scratch>/d1 --file schema.sql
npx wrangler@4 dev --local --port 8861 --ip 127.0.0.1 --persist-to <scratch>/d1
```

Locally, a request's own `CF-Connecting-IP` header is honoured, so tests can act as many IPs; requests without one share the bucket `unknown`, so a browser walk-through runs into the 5-classes-per-hour limit quickly (`DELETE FROM hits` resets it). To point the app at it, serve a **copy** of the repo with `QA` changed to `http://127.0.0.1:8861/api`; never commit a changed `QA`. If `npx wrangler@4` hangs on the registry lookup, run the cached binary under `~/.npm/_npx/*/node_modules/.bin/wrangler` directly.

## Conventions specific to this project

- Deploy: `CLOUDFLARE_ACCOUNT_ID=3053d192fbbbc176b3016b015244d07b npx wrangler@4 deploy --config <this folder>/wrangler.toml`
- Brian's own class, "Brian Lynch's students": the code is in `~/.config/balloon-prep-qa/brian-code` and the private hub link in `~/.config/balloon-prep-qa/brian-hub-link` (chmod 600). Never commit or paste the link anywhere public. It is a password.
- The repo is public. No keys go in it.
- Test classes use an instructor name that starts with `TEST` and get deleted after the test. Because of the same-name check, give each test class a unique name (add a timestamp).

## Delegation notes

- Work inline. It is one small file.
- Test with the local Worker only; never create classes, students or reports on the live one.
