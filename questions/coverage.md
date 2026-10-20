# CBH question bank coverage check

Bank reviewed: pilot-1.json (49) + pilot-2.json (51) = 100 questions, one question per topic (no topic repeats).
Sources: FAA public documents only (links below). Date checked: 2026-10-20.

## 1. Official CBH test facts

| Fact | Value | Source |
|---|---|---|
| Test | CBH, Commercial Pilot Balloon - Hot Air | FAA Airman Knowledge Testing Matrix |
| Questions | 100 (excludes unscored validation questions) | Testing Matrix |
| Time allowed | 3.0 hours (includes time for validation questions) | Testing Matrix |
| Passing score | 70 | Testing Matrix |
| Minimum age | 16 (to take the test) | Testing Matrix |

Sources:
- Matrix (web, revised 9/25/2026 per search snippet; direct fetch returned 403): https://www.faa.gov/training_testing/testing/testing_matrix
- Matrix PDF, effective April 24, 2023 (I read this one directly; CBH row = 100 / 16 / 3.0 / 70): https://www.faa.gov/sites/faa.gov/files/testing_matrix.pdf
- Context from the same matrix: CBG (gas) = 60 q / 2.5 h; PBH (private hot air) = 60 q / 2.5 h. Do not confuse with CBH.
- Commercial LTA PTS FAA-S-8081-18A (Nov 2023): https://www.faa.gov/training_testing/testing/acs/commercial_lta_pts_18.pdf
- 14 CFR 61.125: https://www.ecfr.gov/current/title-14/chapter-I/subchapter-D/part-61/section-61.125

NOT confirmed from an FAA source:
- Per-area question counts or weights for CBH. The FAA does not publish a blueprint with percentages that I could find.
- Contents of the Commercial Pilot Knowledge Test Guide (FAA-G-8082-5 or successor) for balloons; not retrieved.
- Learning Statement Reference Guide codes for CBH; the FAA Dec 2024 community advisory says the guide is posted on faa.gov, but I did not open it.
- Whether the CBH test draws on PTS Area I (Fundamentals of Instructing). The PTS lists it as an area of operation; whether the knowledge test samples it is unconfirmed.

## 2. What the FAA defines as the content

14 CFR 61.125(b) knowledge areas (16): (1) regs on commercial privileges/limitations/operations; (2) NTSB accident reporting; (3) aerodynamics/principles of flight; (4) meteorology incl. critical weather, wind shear, reports and forecasts; (5) safe and efficient operation; (6) weight and balance; (7) performance charts; (8) exceeding performance limits; (9) charts and magnetic compass, pilotage, dead reckoning; (10) air navigation facilities; (11) ADM and judgment; (12) aircraft systems; (13) maneuvers, procedures, emergencies; (14) night and high-altitude ops; (15) NAS procedures; (16) LTA flight and ground training procedures.

PTS 8081-18A Areas of Operation (LTA): I Fundamentals of Instructing (A-G: learning process, human behavior, teaching process/methods, critique, instructor responsibilities, planning); II Technical Subjects (aeromedical, scanning/collision avoidance, principles of flight, regs and publications, NAS, logbook entries/endorsements); III Preflight Preparation (certificates/documents, weather, flight planning, performance/limitations, systems); IV Preflight lesson; V Preflight Procedures (site, crew briefing, layout, inspection, inflation, basket, pre-launch); VI Airport Ops (radio); VII Launches and Landings; VIII Performance Maneuvers (ascents, altitude control, descents, contour, obstacle avoidance, tethering, winter, mountain); IX Navigation; X Emergencies (malfunctions, survival gear, water landing, thermal flight); XI Postflight (recovery, pack-up, refueling).

## 3. Coverage table

Our area totals: REG 22, THY 18, OPS 15, WXT 15, WXS 12, AIR 10, ADM 5, DAC 3 (=100).

| FAA area / topic | Our Qs | Status |
|---|---|---|
| 61.125(1) Commercial privileges, limitations, regs | ~14 (REG) | covered |
| 61.125(2) NTSB reporting | 1 | thin (only reporting trigger; no 830 events/notification detail) |
| Certificates and documents, logbooks, medical, flight review | ~8 | covered |
| Airworthiness, inspections, maintenance records, equipment | 4 | covered |
| Aerodynamics / principles of flight (balloon buoyancy, lift) | 18 (THY) | covered, heavy |
| Meteorology: theory, fronts, stability, fog, thermals | 15 (WXT) | covered |
| Weather reports/forecasts (METAR, TAF, FB, AIRMET, etc.) | 12 | covered; thin on SIGMET, TAF decoding, surface analysis/prog charts |
| Weight and balance / load calc / gross weight | 2-3 | thin |
| Performance charts (density altitude chart) | 3 DAC | thin (no balloon performance/lift charts, no pressure altitude calcs) |
| Exceeding performance limits (diminished capacity, temp limit) | ~3 | covered |
| Charts and compass, pilotage, dead reckoning | 1 (mag var) | MISSING (no sectional symbols/figure questions, no course/distance/time, no fuel-time calcs from track) |
| Air navigation facilities (VOR, GPS, NOTAMs, A/FD) | 0 | MISSING |
| ADM and judgment | 5 | thin |
| Aeromedical (hypoxia, CO, vision, fatigue, alcohol) | ~3 | thin |
| Aircraft systems (fuel, burner, valves, pressurization) | ~8 | covered; envelope fabric/load tapes, instruments (pyrometer, altimeter, variometer) thin |
| Maneuvers/emergencies (power line, fuel leak, pilot light, envelope damage) | ~8 | covered |
| Launch/landing, crew, inflation, recovery, tethering | ~7 | covered; inflation and deflation/pack-up not seen |
| Night and high-altitude operations | 0 | MISSING |
| NAS procedures (airspace classes, SUA, TFR, MTR) | 10 (AIR) | covered; Class C, Class A, ADS-B/transponder, ATC comms thin |
| Radio communications / phraseology (PTS VI) | 0 | MISSING |
| LTA training procedures (61.125(16)), flight instructing (PTS I) | 0 | MISSING (relevance to CBH unconfirmed) |
| Water landing, survival gear, thermal flight (PTS X) | 0 | MISSING |
| Winter and mountain flying (PTS VIII) | ~1 (DAC mountain) | thin |
| Visual scanning / collision avoidance | 0 | MISSING |

## 4. Topics FAA lists that we do not cover at all

Verified against the lists above: navigation by chart and compass, air navigation facilities/NOTAMs, night and high-altitude ops, radio communications, water landing/survival gear, visual scanning, fundamentals of instructing (if tested), LTA training procedures. Not missing: aeromedical (partial), NTSB (one question), documents (covered). Sectional chart figure questions are absent.

## 5. Over-weighted

- THY at 18% and WXT at 15% against 61.125 treatment of aerodynamics and meteorology as two of 16 areas.
- Pure regulations at 22% is reasonable for commercial, but several single-topic items (right-of-way, safety belts, alcohol) are low-yield versus navigation.
- Weather services is fine; weather theory has near-duplicate subtopics (radiation fog, advection fog, surface inversion, wind shear at inversion).
- No FAA percentages exist, so "over-weight" is relative to the breadth of 61.125 and PTS only.

## 6. Grade: C+

The bank is solid on regulations, balloon theory, weather and emergency/operations, and each topic is accurate-looking and distinct. But it samples one question per topic (100 topics, no depth), so no topic is drilled. It entirely omits navigation (charts, compass, facilities, NOTAMs), night and high-altitude operations, radio communications, collision avoidance and survival/water landing, all of which 61.125 or the PTS name. Weight and balance, performance charts, ADM and aeromedical are thin. The real test is 100 questions with a 70 pass mark, so these gaps could cost several questions. Grade reflects breadth strength and navigation gaps; it could rise to B with the additions below. Grade is based on public FAA outlines, not an FAA question blueprint, which is not published.

## 7. Recommended mix for the next 400 questions

| Area | Add | Focus |
|---|---|---|
| AIR (navigation, charts, facilities, radio, airspace) | 90 | sectional symbols/figures, compass, pilotage, dead reckoning, NOTAMs, A/FD, VOR/GPS, Class A/B/C/E, ADS-B, radio phraseology |
| REG | 60 | NTSB 830 detail, commercial ops, 61.57/61.56, logbooks, medical, balloon airworthiness depth |
| THY / DAC / weight and balance | 70 | load and gross weight calcs, lift charts, pressure and density altitude, fuel/flight time calcs |
| WXS | 50 | SIGMET, TAF decoding, prog/surface charts, winds aloft calcs, NWS products |
| WXT | 35 | stability, thunderstorms, mountain wave, wind shear, critical weather |
| OPS | 45 | inflation, deflation, recovery, water landing, survival gear, instruments, night ops, high-altitude/oxygen |
| ADM / aeromedical | 40 | hazardous attitudes scenarios, CRM, stress, fatigue, hypoxia, vision, scanning/collision avoidance |
| PTS I / LTA training (only if CBH tests it) | 10 | hold until confirmed |

Total 400. Also give the existing 100 a second question on each high-yield topic.
