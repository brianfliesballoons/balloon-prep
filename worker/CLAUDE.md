# balloon-prep/worker: the Ask-your-instructor backend

> **Reading protocol:** the parent [balloon-prep/CLAUDE.md](../CLAUDE.md) routes here. This file is authoritative inside this folder.

## Active to-do

1. LIVE 2026-10-20. Watch the first real student questions in Brian's hub.

## What this is

A Cloudflare Worker `balloon-prep-qa` on Brian's own account (https://balloon-prep-qa.brianfliesballoons.workers.dev), with a D1 database `balloon-prep-qa` (WNAM). Students join a class by its code, ask questions tied to a topic and a practice question, and the instructor answers in the hub. There are no accounts. A class has a public 6-character join code and a secret hub key, and each student has a secret key on their device. Only SHA-256 hashes of the keys are stored.

## The files

| File | What it is |
|---|---|
| `src/worker.js` | The whole API. CORS is limited to the GitHub Pages origin and `localhost:8765`. Limits: 2,000 characters per text, 50 questions per student per day. |
| `schema.sql` | The tables: classes, students, questions. |
| `wrangler.toml` | `account_id` is pinned because this login also sees a client's account. |

## Conventions specific to this project

- Deploy: `CLOUDFLARE_ACCOUNT_ID=3053d192fbbbc176b3016b015244d07b npx wrangler@4 deploy --config <this folder>/wrangler.toml`
- Brian's own class, "Brian Lynch's students": the code is in `~/.config/balloon-prep-qa/brian-code` and the private hub link in `~/.config/balloon-prep-qa/brian-hub-link` (chmod 600). Never commit or paste the link anywhere public. It is a password.
- The repo is public. No keys go in it.
- Test classes use an instructor name that starts with `TEST` and get deleted after the test.

## Delegation notes

- Work inline. It is one small file.
