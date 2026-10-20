# balloon-prep: Balloon Written Prep prototype

> **Reading protocol:** the parent [CODING/CLAUDE.md](../CLAUDE.md) routes here. This file is authoritative inside this folder.

## Active to-do

1. **Brian and Kevin are reviewing the prototype** (link sent 2026-10-20). Wait for their feedback before adding more charts or questions.
2. **Question bank plan, not started:** original questions written from public-domain FAA sources (Balloon Flying Handbook FAA-H-8083-11, PHAK, AIM, 14 CFR 61/91, the testing supplement figures), tagged to the PBH/CBH topic areas, with Brian grading every question. Never copy Prepware, Gleim or other third-party questions.

## What this is

A learning app for the balloon written test, Brian's alternative to ASA Prepware, prompted by Kevin's feedback that Prepware's charts are too small to read on a phone. The prototype is one chart (density altitude, in the style of FAA Figure 8) with 4 original questions. Chart features: sharp redraw at any zoom, axis numbers pinned to the visible edges, tap a line to highlight it, a Line tool that snaps horizontal or vertical and reads the axis, a Pen, a Read crosshair, a step-by-step walkthrough and full screen.

## The files

| File | Status | What it is |
|---|---|---|
| `index.html` | primary | The whole app: one self-contained page (canvas chart, no libraries). |

## Conventions specific to this project

- Public repo `brianfliesballoons/balloon-prep`, served on GitHub Pages at https://brianfliesballoons.github.io/balloon-prep/. Nothing private goes in it.
- The chart is computed, not traced: density altitude = pressure altitude + 120 × (OAT − standard temp), with standard temp = 15 − 1.98°C per 1,000 ft. Question answers are computed from the same math. The altimeter table holds the standard FAA conversion factors.
- Publish: edit `index.html`, then `git commit` and `git push`. Pages rebuilds in about a minute.

## Delegation notes

- Work inline. The page is a single file; syntax-check the script with `node --check` on the extracted `<script>` before pushing.
