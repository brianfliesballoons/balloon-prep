# balloon-prep: Balloon Written Prep prototype

> **Reading protocol:** the parent [CODING/CLAUDE.md](../CLAUDE.md) routes here. This file is authoritative inside this folder.

## Active to-do

1. **Kevin's feedback (2026-10-20):** the draw tool is "hugely helpful", and having the question, chart and answer guide on ONE page beats Prepware, where they are three separate pages. Keep that single-page layout as a core design rule. Marks were thinned the same day (Brian misread "huge" as too big); reverting is optional.
2. **First 100 questions written, fact-checked and LIVE (2026-10-20)**: 100 + 4 sample density-altitude questions. Independent fact-check against public FAA sources: 86 confirmed, 14 fixed (wording/refs/giveaway lengths), 0 wrong (`questions/verify-1.json`, `verify-2.json`). Coverage check vs FAA: grade C+ (`questions/coverage.md`): gaps are charts/navigation, nav aids/NOTAMs, night/high-altitude ops, radio/collision avoidance, water landing/survival. Brian's target is 500–1,000.
3. **Building the next 400 (Brian, 2026-10-20: "keep building").** `pilot-4.json` (REG 50 + OPS 50) is fact-checked (87 confirmed, 13 fixed, 0 wrong keys; `verify-4.json`) and LIVE, so the bank is 204. `pilot-3.json` (AIR 60 + ADM 40) is written and being fact-checked; add it to `FILES` after that. Brian's rulings 2026-10-20: **REG-405 DELETED** ("Categorically not a collision… FAA would laugh"; never write a question treating a festival balloon-to-balloon touch as an NTSB collision). REG-440 kept: lights before official sunrise are correct; the FAA applies the more stringent definition. REG-442 kept: every airworthy aircraft needs its inspection. Round 2 still to write: THY/DAC/weight and balance 70, WXS 50, WXT 35, the rest. Per-file ID ranges: AIR-3xx/ADM-3xx in pilot-3, REG-4xx/OPS-4xx in pilot-4. Every new question also needs a line in `lessons/map.json`.
4. **Learn section: BUILT and LIVE (2026-10-20, on Brian's "go ahead and build")**. Design board: https://claude.ai/artifact/FL3MiN6UnRYMkrJmMpzppk. The Learn tab has:
   - a next step, a review queue (a missed question returns the next day and clears after two right answers on different days), flagged questions, and a study plan built from the last practice test (with a test date and minutes per day)
   - a 27-topic map with mastery levels (Not started, Familiar, Proficient, Mastered)
   - one lesson per topic: the idea (with a slider widget where there is one), a worked example, an "I don't get this at all" back-to-basics walkthrough, check questions, FAA links, and "Ask your instructor", which opens the student's own email or text app (no backend)
   - "Learn this" and a GitHub-issue "report a problem" link on every answered question
   Lessons live: `thy-da`, `thy-load`. **The other 25 lessons are being written (A: reg/air/wx-stability/fog/fronts; B: the rest), then fact-checked, then merged into `lessons/lessons.json`.** Brian's pilot's notes: the `pilotNote` field per lesson, shown only when filled. Kevin's idea gave us the back-to-basics button; Brian's idea gave us Ask your instructor.
5. **Question bank plan:** original questions written from public-domain FAA sources (Balloon Flying Handbook FAA-H-8083-11, PHAK, AIM, 14 CFR 61/91, the testing supplement figures), tagged to the PBH/CBH topic areas, with Brian grading every question. Never copy Prepware, Gleim or other third-party questions.

## What this is

A learning app for the balloon written test (real CBH test: 100 questions, 3.0 hours, 70% to pass — FAA Airman Knowledge Testing Matrix), Brian's alternative to ASA Prepware, prompted by Kevin's feedback that Prepware's charts are too small to read on a phone. The prototype is one chart (density altitude, in the style of FAA Figure 8) with 4 original questions. Chart features: sharp redraw at any zoom, axis numbers pinned to the visible edges, tap a line to highlight it, a Line tool that snaps horizontal or vertical and reads the axis, a Pen, a Read crosshair, a step-by-step walkthrough and full screen.

## The files

| File | Status | What it is |
|---|---|---|
| `index.html` | primary | The whole app: study mode (area/missed/flagged filters), 100-question practice test with grid navigator, results by area, saved progress, density-altitude chart workbench, and grader mode at `#grade` (Looks good / Needs a fix + notes, copy notes to paste to Claude). |
| `questions/pilot-1.json`, `pilot-2.json` | primary | The question bank (fields: id, area, topic, stem, choices[3], answer, explanation, ref, figure, difficulty, confidence, checked; DAC adds elev/alt/oat). A trailing "CHECK: …" sentence in an explanation shows only in grader mode. New files must be added to `FILES` in index.html. |
| `lessons/lessons.json` | primary | Topic catalog (groups, 27 topics, official links) plus each topic's `lesson` (idea, widget, body, example, basics, optional pilotNote). Only `**bold**`/`*italic*` markup. |
| `lessons/map.json` | primary | Question id → topic id. Every new question must be added here or it won't appear in Learn. |
| `questions/verify-*.json`, `coverage.md` | reference | Fact-check verdicts and the coverage report from 2026-10-20. |

## Conventions specific to this project

- Public repo `brianfliesballoons/balloon-prep`, served on GitHub Pages at https://brianfliesballoons.github.io/balloon-prep/. Nothing private goes in it.
- The chart is computed, not traced: density altitude = pressure altitude + 120 × (OAT − standard temp), with standard temp = 15 − 1.98°C per 1,000 ft. Question answers are computed from the same math. The altimeter table holds the standard FAA conversion factors.
- Publish: edit `index.html`, then `git commit` and `git push`. Pages rebuilds in about a minute.

## Delegation notes

- Work inline. The page is a single file; syntax-check the script with `node --check` on the extracted `<script>` before pushing.
