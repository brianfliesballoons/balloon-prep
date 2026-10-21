# balloon-prep: Balloon Written Prep prototype

> **Reading protocol:** the parent [CODING/CLAUDE.md](../CLAUDE.md) routes here. This file is authoritative inside this folder.

## Active to-do

1. **Kevin's feedback (2026-10-20):** the draw tool is "hugely helpful", and having the question, chart and answer guide on ONE page beats Prepware, where they are three separate pages. Keep that single-page layout as a core design rule. Marks were thinned the same day (Brian misread "huge" as too big); reverting is optional.
2. **First 100 questions written, fact-checked and LIVE (2026-10-20)**: 100 + 4 sample density-altitude questions. Independent fact-check against public FAA sources: 86 confirmed, 14 fixed (wording/refs/giveaway lengths), 0 wrong (`questions/verify-1.json`, `verify-2.json`). Coverage check vs FAA: grade C+ (`questions/coverage.md`): gaps are charts/navigation, nav aids/NOTAMs, night/high-altitude ops, radio/collision avoidance, water landing/survival. Brian's target is 500–1,000.
3. **Question bank: 703 questions, all fact-checked and LIVE (round 2 finished 2026-10-20).** Files: pilot-1/2 (100), pilot-3 AIR/ADM-3xx, pilot-4 REG/OPS-4xx, pilot-5 THY-5xx + DAC-5xx, pilot-6 WXS/WXT-6xx, pilot-7 OPS/REG/AIR-7xx, pilot-8 mixed 8xx. Each batch was written by one agent and checked by another (`verify-1..8.json`; round 2: 85/15, 70/30, 82/18, 91/9 confirmed/fixed, 0 cut, 0 wrong keys). The practice-test mix was rebalanced (REG 18, AIR 14, OPS 16, THY 14, WXS 12, WXT 12, ADM 10, DAC 4); the FAA publishes no CBH weights. Brian's rulings: REG-405 DELETED (never treat a festival touch as an NTSB collision); REG-440 and REG-442 kept. ▶ Teaching calls for Brian: AIR-325 (1' latitude = 1 NM), AIR-357 (steady red: stay clear), WXT-620 (inversion mix-out brings the wind down; an inference), WXT-626 (18–24 h before a front; practice, not a rule), THY-519/520/522 (absolute-temperature lift arithmetic: keep?), THY-567 (overtemp worded as degrading coatings and shortening fabric life), REG-703 (what a 61.133 instructor without a CFI puts in the 61.51(h) date item), OPS-823 (lower balloon has right-of-way by custom). Next if wanted: toward 1,000, and sectional/figure questions with real chart images.
4. **Learn section: BUILT and LIVE (2026-10-20, on Brian's "go ahead and build")**. Design board: https://claude.ai/artifact/FL3MiN6UnRYMkrJmMpzppk. The Learn tab has:
   - a next step, a review queue (a missed question returns the next day and clears after two right answers on different days), flagged questions, and a study plan built from the last practice test (with a test date and minutes per day)
   - a 27-topic map with mastery levels (Not started, Familiar, Proficient, Mastered)
   - one lesson per topic: the idea (with a slider widget where there is one), a worked example, an "I don't get this at all" back-to-basics walkthrough, check questions, FAA links, and "Ask your instructor", which opens the student's own email or text app (no backend)
   - "Learn this" and a GitHub-issue "report a problem" link on every answered question
   **All 27 lessons LIVE (2026-10-20)**, each written then independently fact-checked (`lessons/drafts/verify-A.json`, `verify-B.json`, drafts git-ignored). ▶ Open teaching calls for Brian: chase-crew 123.3/123.5 without FCC detail; "stitches, home same day" treated as not serious under 830.2; the temperature-flag step rests on manufacturer documents; "vent" (OPS-009) vs "rip" (FAA-P-8740-34) into wires; sun on a dark envelope (BFH Ch. 2 vs Ch. 7) is a place for his pilot's note. Brian's pilot's notes: the `pilotNote` field per lesson, shown only when filled. Kevin's idea gave us the back-to-basics button; Brian's idea gave us Ask your instructor.
5. **Ask your instructor, shared: LIVE 2026-10-20** (Brian: "cross collaborated… like the travel app"). It runs on the `balloon-prep-qa` Worker + D1 (see [worker/CLAUDE.md](worker/CLAUDE.md) 📘). Students join a class by invite link or code and ask from any lesson or practice question. The hub shows each question with the full practice question (stem, choices, what the student picked, the answer, the explanation, the reference) and an answer box, and polls every 30 s. The student's Learn page shows "Your questions" with answers. Brian's class "Brian Lynch's students" is created; the link is in `~/.config/balloon-prep-qa/`. Students see only their own questions (a shared class FAQ was offered, not chosen). Later: user profiles.
6. **Question bank plan:** original questions written from public-domain FAA sources (Balloon Flying Handbook FAA-H-8083-11, PHAK, AIM, 14 CFR 61/91, the testing supplement figures), tagged to the PBH/CBH topic areas, with Brian grading every question. Never copy Prepware, Gleim or other third-party questions.

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
