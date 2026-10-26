# balloon-prep/worker: the Ask-your-instructor backend

> **Reading protocol:** the parent [balloon-prep/CLAUDE.md](../CLAUDE.md) routes here. This file is authoritative inside this folder.

## Active to-do

1. LIVE 2026-10-20. Watch the first real student questions in Brian's hub.
2. **Round 2 LIVE 2026-10-21** (Worker version d3f65969): rate limits, same-name check, verified/owner marks (Brian's class has both), problem reports, answer drafts (filled by the private watchdog `com.bcl.balloon-qa-watch`, see BCL/CODING/balloon-prep-qa-watch/), student deletion, and **phone notifications** when an answer lands (`src/push.js`, Web Push with VAPID; table `push_subs`; secrets `VAPID_PUBLIC`/`VAPID_PRIVATE` set on the Worker, private copy in `~/.config/balloon-prep-qa/vapid.env`; rotating them drops every subscription). Both migrations in `migrations/` are applied to production. Pre-migration backup: `~/.config/balloon-prep-qa/backups/pre-round2-2026-10-21.sql`.
   - Tooling: `npx wrangler@4` can hang on the npm lookup; the cached binary `~/.npm/_npx/32026684e21afda6/node_modules/.bin/wrangler` works. `--remote` D1 calls failed with code 7403 when `CLOUDFLARE_ACCOUNT_ID` was set in the environment and worked without it (wrangler.toml pins the account).
   - A real push test needs a normal (not headless) Chrome window; `tools/push-selftest.mjs` checks the encryption offline. iPhone: Home Screen app only, iOS 16.4+, and it has its own storage, so a student moves their class there with the sign-in code (Learn → Your questions).
3. **Past tests + missed questions: LIVE 2026-10-26** (main 4e7167a, Worker version 245d684c): `migrations/2026-10-26-missed.sql` (scores.missed, skipped, of_n) applied to production first. Pre-migration backup: `~/.config/balloon-prep-qa/backups/pre-missed-2026-10-26.sql`.

## What this is

A Cloudflare Worker `balloon-prep-qa` on Brian's own account (https://balloon-prep-qa.brianfliesballoons.workers.dev), with a D1 database `balloon-prep-qa` (WNAM). Students join a class by its code, ask questions tied to a topic and a practice question, and the instructor answers in the hub. Anyone can send an anonymous "something is wrong" report about a question, lesson or reference card; the app owner reads them in their hub. There are no accounts. A class has a public 6-character join code and a secret hub key, and each student has a secret key on their device. Only SHA-256 hashes of the keys are stored.

## The files

| File | What it is |
|---|---|
| `src/worker.js` | The whole API (contract below). |
| `schema.sql` | The **full current** schema, for a fresh database. |
| `migrations/` | Additive-only changes for the live database, one file per round, applied by hand. `2026-10-21-round2.sql` = round 2. |
| `src/auth.js` | Optional student accounts (passkeys, email codes, Google) and progress sync. |
| `wrangler.toml` | `account_id` is pinned because this login also sees a client's account. `[vars] GOOGLE_ID`. |
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

### Accounts (`src/auth.js`, added 2026-10-22, migration `2026-10-22-accounts.sql`)

Session = `Authorization: Bearer <token>` (sha256 stored in `sessions`; idle 400 days). Per-IP limits in `AUTH_RATE` (merged into `RATE`).

| Endpoint | What it does |
|---|---|
| `GET /api/auth/config` | `{passkey, google, email}`: which ways in are on. email needs `GMAIL_FROM` var + `GOOGLE_SECRET` + meta `gmail_refresh`. |
| `POST /api/auth/email/start {email}` / `verify {email, code}` | 6-digit code via the app's Gmail (10 min, 5 tries, 60 s gap) → `{token, isNew}`. |
| `POST /api/auth/passkey/options {mode:create\|get}` / `verify` | WebAuthn, ES256/RS256, UV required, attestation none, origin must be in `origins()`, rpId = origin host. create with a session adds a passkey to that account. Unknown credential → 404 `{unknown: cid}`. |
| `GET /api/auth/google/go?hh=<sha256 hex>[&setup=gmail]` | 302 to Google (PKCE). Returns to `signed-in.html`. setup=gmail = one-time authorisation of the sending Gmail. |
| `POST /api/auth/google/finish {state, code}` | From signed-in.html: exchanges the code → `{code6, email}` (or `{gmail:true}`). |
| `POST /api/auth/google/poll {h, code?}` | App: `{wait}` / `{token,email,isNew}` (same network, or right code) / `{needCode}`. |
| `GET /api/me` · `GET/PUT /api/me/progress {prog, base}` | PUT 409 returns the newer `{prog, ver}`; 1 MB cap. |
| `POST /api/me/signout` · `DELETE /api/me` | Delete returns passkey ids so the app can signal the phone to forget them. |

Secrets/vars: `GOOGLE_ID` (var, public), `GOOGLE_SECRET` (secret; set from the clipboard with `pbpaste | wrangler secret put GOOGLE_SECRET`, never printed), `GMAIL_FROM` (var, not set yet).

Existing contracts are unchanged; responses only gained fields (`verified`, `owner`, `draft`), so already-open old clients keep working.

## Limits

Per IP, keyed on `sha256(salt | CF-Connecting-IP)`. The raw IP is never stored. The salt is a random value the Worker creates once in the `meta` table (`k='salt'`). `hits` rows older than 2 days are pruned on every recorded hit.

| Bucket | Per IP | Also |
|---|---|---|
| New class | 5 per hour, 20 per day | |
| Join | 60 per hour, 300 per day (a whole class on one school Wi-Fi fits) | 150 new students per class per 24 h |
| Report | 12 per hour, 50 per day | 5,000 waiting reports in total |
| Question | | 50 per student per 24 h (unchanged) |
| Score | 30 per hour, 200 per day | 20 per student per 24 h; the newest 200 kept per student; a POST over 12,000 bytes gets 413 (raised from 2,000 on 2026-10-26 so 200 missed questions fit) |

Validation errors (400) are checked first and do not count. A refused same-name class (409) does count, which also slows name probing. Change the numbers in `RATE`, `JOINS_PER_CLASS_DAY` and `REPORTS_MAX` at the top of `worker.js`.

## Scores to the instructor (added 2026-10-23, migration `migrations/2026-10-23-scores.sql`)

A student sends a practice-test score only by tapping **Send to my instructor** on the results page, or by turning on **Always send my practice test scores** for that class. Stored per score (table `scores`): track P/C, n, right, pct and pass (both worked out by the Worker), active seconds, per-area `[right,total]`, per-area flag counts, `taken` (when the test finished) and `created`. **Since 2026-10-26 (migration `migrations/2026-10-26-missed.sql`, nullable columns `missed`, `skipped`, `of_n`):** n = questions *answered* (unanswered ones are skipped, never missed, and the score is right ÷ answered); `of` = the test's length and `skipped` = of − n; and, **only when the student ticks "Include the questions I missed"**, `missed` = `[{id, pick}]` for every wrong answer (id = the bank's question id, `^[A-Z]{2,6}-[A-Z0-9]{1,10}$`; pick = the answer chosen, 0–2; exactly n − right entries, at most 200, no repeats). Never question text, never the answers to questions they got right. Always send never includes `missed`. Rows from older apps have NULL in all three and render exactly as before. One row per student per `taken`: a second send of the same test returns the first copy (`dup:true`, plus `withMissed:true` when that copy has missed questions). **Re-send rule:** if the stored copy has no `missed` and the re-send carries them with the same n and right, they are added to that copy once (`updated:true`), and its `created` moves to now so it counts as new in the hub; a copy that already has `missed` is never changed. Every score a student sent is deleted when they leave (`DELETE …/scores/mine`, which the app's plain **Leave class** calls), leave-and-delete (`students/me`), or are removed by the instructor.

| Endpoint | Auth | What it does |
|---|---|---|
| `POST /api/classes/:code/scores {track, n, right, sec, areas:{AREA:[right,total]}, flags?:{AREA:count}, taken, of?, skipped?, missed?:[{id,pick}]}` | student | → `{ok, id, created, dup?, updated?, withMissed?}`. 400 if the numbers do not add up (areas must sum to n and right, flags ≤ the area's questions, known areas only, taken within the last 366 days; of between n and 200; skipped = of − n; missed exactly n − right well-formed entries, ≤ 200). Dups (and the one-time missed update) are answered before the limits and never count. |
| `DELETE /api/classes/:code/scores/mine` | student | → `{ok, deleted}`. |
| `GET /api/classes/:code/scores` | hub | `score_view='all'`: `{view, seen, scores:[{id,sid,track,n,right,pct,pass,sec,areas,flags,taken,created,missed,skipped,of}]}` (the last three null for older rows), newest first, up to 500. `'weekly'`: `{view, seen, since, fresh, weekly:[{sid, tests, avg, pass, tracks, areas, flags, last}]}` over the last 7 days, and no single scores. |
| `POST /api/classes/:code/scores/seen {t?}` | hub | Scores sent up to `t` (default now) stop counting as new (`classes.scores_seen`). |
| `POST /api/classes/:code/settings {scoreView:'all'\|'weekly'}` | hub | The instructor's choice of how much they see (`classes.score_view`, default `all`). Never in the public class info. |
| `GET /api/classes/:code/hub` | hub | Gained `scores: {total, fresh, view}` for the tab's "N new". The app shows the Scores tab only when this field is there, so a new page against the old Worker simply has no tab. |

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
