# balloon-prep: Balloon Written Prep prototype

> **Reading protocol:** the parent [CODING/CLAUDE.md](../CLAUDE.md) routes here. This file is authoritative inside this folder.

## Active to-do

1. **Kevin's feedback (2026-10-20):** the draw tool is "hugely helpful", and having the question, chart and answer guide on ONE page beats Prepware, where they are three separate pages. Keep that single-page layout as a core design rule. Marks were thinned the same day (Brian misread "huge" as too big); reverting is optional.
2. **First 100 questions written, fact-checked and LIVE (2026-10-20)**: 100 + 4 sample density-altitude questions. Independent fact-check against public FAA sources: 86 confirmed, 14 fixed (wording/refs/giveaway lengths), 0 wrong (`questions/verify-1.json`, `verify-2.json`). Coverage check vs FAA: grade C+ (`questions/coverage.md`): gaps are charts/navigation, nav aids/NOTAMs, night/high-altitude ops, radio/collision avoidance, water landing/survival. **Next: Brian grades via `#grade`, then write the next 400 aimed at those gaps.** Brian's target is 500–1,000.
3. **Brian and Kevin are reviewing the prototype** (link sent 2026-10-20). Wait for their feedback before adding more charts or questions.
4. **Question bank plan:** original questions written from public-domain FAA sources (Balloon Flying Handbook FAA-H-8083-11, PHAK, AIM, 14 CFR 61/91, the testing supplement figures), tagged to the PBH/CBH topic areas, with Brian grading every question. Never copy Prepware, Gleim or other third-party questions.

## What this is

A learning app for the balloon written test (real CBH test: 100 questions, 3.0 hours, 70% to pass — FAA Airman Knowledge Testing Matrix), Brian's alternative to ASA Prepware, prompted by Kevin's feedback that Prepware's charts are too small to read on a phone. The prototype is one chart (density altitude, in the style of FAA Figure 8) with 4 original questions. Chart features: sharp redraw at any zoom, axis numbers pinned to the visible edges, tap a line to highlight it, a Line tool that snaps horizontal or vertical and reads the axis, a Pen, a Read crosshair, a step-by-step walkthrough and full screen.

## The files

| File | Status | What it is |
|---|---|---|
| `index.html` | primary | The whole app: study mode (area/missed/flagged filters), 100-question practice test with grid navigator, results by area, saved progress, density-altitude chart workbench, and grader mode at `#grade` (Looks good / Needs a fix + notes, copy notes to paste to Claude). |
| `questions/pilot-1.json`, `pilot-2.json` | primary | The question bank (fields: id, area, topic, stem, choices[3], answer, explanation, ref, figure, difficulty, confidence, checked; DAC adds elev/alt/oat). A trailing "CHECK: …" sentence in an explanation shows only in grader mode. New files must be added to `FILES` in index.html. |
| `questions/verify-*.json`, `coverage.md` | reference | Fact-check verdicts and the coverage report from 2026-10-20. |

## Conventions specific to this project

- Public repo `brianfliesballoons/balloon-prep`, served on GitHub Pages at https://brianfliesballoons.github.io/balloon-prep/. Nothing private goes in it.
- The chart is computed, not traced: density altitude = pressure altitude + 120 × (OAT − standard temp), with standard temp = 15 − 1.98°C per 1,000 ft. Question answers are computed from the same math. The altimeter table holds the standard FAA conversion factors.
- Publish: edit `index.html`, then `git commit` and `git push`. Pages rebuilds in about a minute.

## Delegation notes

- Work inline. The page is a single file; syntax-check the script with `node --check` on the extracted `<script>` before pushing.
