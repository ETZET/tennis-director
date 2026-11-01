# Hollow Creek · Change Backlog

Oct 31, 2026 · @Enting

A running list of agreed changes to the Hollow Creek sandbox. Nothing here is implemented yet unless it's under Done; add to it as new feedback comes in.

## Decisions

| Decision | Choice | Source |
| --- | --- | --- |
| Interface direction | **B · Courtside broadcast**: TV-style score bug, stat strip, lower-third event cards, news ticker | [Interface Directions canvas](https://claude.ai/artifact/Q4yXHarTTMGQEqSE1RQR9s), board B |
| World shape | Floating island in the sky, no water falling off the edges | Design Options canvas, Floating island page |
| Render resolution | Always Fine (native); no pixel-size control | Feedback, Oct 30 |
| Board layout | **5 · Creek divide**: the creek splits the island; the working club is on the north bank, the dead courts are across a footbridge | [Board Layouts canvas](https://claude.ai/artifact/9sFvYXXi1P6faNLgFvjdP2), board 5 |
| Visual style | **Rejected (Oct 30): **pixel diorama test (low-res pixels, depth outlines, OKLab 64 colours, hard shadows). Do not implement. Still looking for a new direction. | [Hollow Creek Diorama (deprecated)](https://claude.ai/artifact/6NZnAEQTg1KDTbSAqhVGf7) |
| Default view | Whole floating island on load (V4); story beats zoom in | Interface Directions canvas, View options board |

## To do · Interface (direction B)

Replace today's dark panels with the broadcast look from board B. Type: Saira Semi Condensed for numbers and headings, Saira for text. Colors: navy panels `#0f1f3a` at about 90% opacity, court green `#1f6b4f`, optic yellow `#d7ff3c` as the one accent.

| # | Change | Replaces | Status |
| --- | --- | --- | --- |
| B1 | Score bug, top left: club badge, club name, game clock | Title card with crest and four chips | Done |
| B2 | Stat strip, top right: quality grade and score, members, courts open, your salary | Program report panel (always open, a quarter of the screen) | Done |
| B3 | Event cards as a lower third: topic tag, location tag, headline, countdown bar, three numbered answers (keys 1, 2, 3) | Story toasts; also the format for M1 event cards | Done |
| B4 | “Club wire” ticker along the bottom edge for the day's incidents | Incident log inside the report panel | Done |
| B5 | Court markers: yellow number box plus a short status for courts in use, grey for closed ones | Black all-caps label plates | Done |
| B6 | Controls folded into the right end of the ticker: rotate, pause (highlighted), speed | Nine-button toolbar | Done |
| B7 | Detailed stats (balls left on court, coach phone time, shot accuracy, complaints) open from the stat strip on click | The rest of the report panel | Done |
| B8 | Build the HUD as Preact components in `packages/ui`, reading a state snapshot, per the technical doc | Hand-built DOM in `apps/sandbox` | Done |
| B9 | Update screenshot baselines and the sandbox preview once B1–B6 land | — | Done |

## To do · View and scene

From the View options board. These were only tried as quick renders in a scratch copy; none is in the code yet.

| # | Change | Why | Status |
| --- | --- | --- | --- |
| V1 | Calm the grass: one family of greens, and tone the 12% dirt tiles to a darker green | Eight grass colors in a patchwork read as noise | Done |
| V2 | Cover the bare brown strip on the north and west edges of the upper terraces | Prototype ground that was off-screen; now visible on the island | Done |
| V3 | Trim the island closer to the club (about x −62 to 64, z −73 to 52) | The club sits in a lot of empty grass | Done |
| V4 | Set the default camera so the floating island reads on load | Today's start view crops the island | Done |

## To do · Board layout (5, Creek divide)

Rebuild the Hollow Creek site plan to match [board 5](https://claude.ai/artifact/9sFvYXXi1P6faNLgFvjdP2). Once this lands it replaces V3 (the new plan sets the island size), and V2 should be checked again because the terraces get rebuilt.

| # | Change | Replaces | Status |
| --- | --- | --- | --- |
| L1 | The creek runs west to east across the middle of the island, with a footbridge at the centre | Creek along the south edge | Done |
| L2 | North bank, the working club: clubhouse and deck (with the director) in the northwest, pool below them, Court 1 tennis and Court 2 pickleball side by side to the east | Clubhouse on the upper terrace above all four courts | Done |
| L3 | Parking in the northeast; the road leaves the island at the east edge, and the car exit route and road end move with it | Parking and road on the east side running north to south | Done |
| L4 | South bank, to be won back: Court 3 collapsed bubble and Court 4 overgrown clay, surrounded by thicker trees, reachable only over the footbridge | Courts 3 and 4 in the second row under Courts 1 and 2 | Done |
| L5 | Footpaths: deck to Court 1, and from the courts over the footbridge to the south bank | Two short paths down the terraces | Done |
| L6 | Update the Act 1 timeline so walkers and events on Courts 3 and 4 cross the footbridge | Today's walk routes | Done |
| L7 | Update screenshot baselines and the sandbox preview once L1 to L6 land | — | Done |

## Other open work

| # | Item | Note | Status |
| --- | --- | --- | --- |
| O1 | Push the local commits to GitHub | Pushed Oct 31 to `ETZET/tennis-director` | Done |
| O2 | M0-3: upgrade three.js from r128 to the current release and retune the lighting against screenshots | Next milestone step in the technical doc | To do |
| O3 | M0-4: move Maple Ridge, Palm Oasis and the activity library over the same way, each as a floating island | Activity library done Oct 31 (ADR 0010); Maple Ridge and Palm Oasis islands still to do | To do |
| O4 | Time × weather looks from the Floating island page (dawn, dusk, night; wind, heat) | The sim now has seasons and daily weather, and rain is drawn; dawn, dusk, night, wind and heat looks still to do | To do |
| O5 | Chinese is the default game language | `?lang=en` for English; HUD strings moved into i18n `ui.hud.*` | Done |
| O6 | Desktop: projection panel covered the HUD stat strip; phone: notes hyphenated mid-word in noticeboard cells | Projection moved bottom-right; whole-word wrap at 10 px | Done |

## To do · Loop v2 playtest

Two review rounds on the phone build (390×844), each with a newcomer and a veteran reviewer scoring 9 items against tenets 1–6. Round 1 started Oct 31 and stopped early when the account hit its monthly spend limit; no scores yet.

| # | Item | Note | Status |
| --- | --- | --- | --- |
| P1 | Resume round 1 reviews | Nov 1, Chinese UI. Newcomer (seed 11): 5.0 avg, lost the vote at board 88. Veteran (seed 23): 4.4 avg, won with 171 members; idle control run lost. Scores and findings below | Done — awaiting sign-off |
| P2 | Fix round 1 findings | Superseded by the staffing loop (ADR 0012): R1 and R7 go away with the noticeboard and energy; the rest are rechecked on the new loop | Superseded |
| P7 | Staffing loop: sim and content (staff, posts, work orders, condition decay, `assign` command, save v3) | ADR 0012 | In progress |
| P8 | Staffing loop: phone UI (drag people onto post outlines and work-order markers, two-tap assign, progress rings and bars); remove noticeboard and action ring | ADR 0012 | To do |
| P9 | Staffing loop: bots, balance report, determinism gate; then round 2 reviews (P3) on the new loop | ADR 0012 | To do |
| P3 | Round 2 reviews and fixes | Republish the playable build afterwards and merge to main | To do |
| P4 | Tune the idle quality drop | Quality target now has a floor of 41 (over-scheduling penalty still applies below it). Idle runs: 44 → ~40.6 on day 1, then hold at 40–41 (was 33 on day 1, settling at 20). Bots unchanged: greedy 83.6%, random 19.9% | Done |
| P5 | Place labels crowd the island centre on phone | At the zoomed-out view only the director's place, destination and places with a card keep names; the rest are tappable dots (44 px target) | Done |
| P6 | Delete the merged animlib-port branch | Already in main. Cloud session can't push deletes; delete it on GitHub by hand | Blocked |

### Round 1 scores (Nov 1)

| Item | Newcomer | Veteran |
| --- | --- | --- |
| Meaningful choices | 5 | 4 |
| Readable consequences | 5 | 4 |
| Pacing | 4 | 4 |
| Player agency | 5 | 5 |
| Idle & living world | 7 | 6 |
| Tension arc | 3 | 2 |
| Replay value | 5 | 4 |
| Onboarding | 5 | 5 |
| Phone UX | 6 | 6 |
| **Average** | **5.0** | **4.4** |

### Round 1 findings for P2 (both reviewers unless noted)

| # | Finding | Suggested fix |
| --- | --- | --- |
| R1 | Open day stacks with no falloff (5 notes ≈ +19 members/week); social night every evening has no cost. One dominant plan for every seed (veteran) | Diminishing returns per week (4/2/1/0); open day uses courts or coach energy; social night costs after the third |
| R2 | Tension dies mid-act: board reaches 88–100 by day 21; the final vote is still a 75–85% roll (newcomer lost at 88) | Weekly board decay; escalating rival/board asks in weeks 4–6; near-certain vote at high confidence, or a conditional stay with a rescue card; list the deciding factors on the ending |
| R3 | Cards repeat and ignore state: Saturday-morning card 3–4×, court-1 double booking 3–4× (even in rain), roof leak 5× when idle, 4 cards within two hours on day 3, empty stretches days 16–21, 24–28, 38–42 | Cooldowns or once-only flags; state-aware triggers; a minimum gap between cards; second appearances escalate |
| R4 | Free or dominated options: walk-there options cost nothing, retired-member card is all upside, "ask for money" is a free +$600, trial-van option 2 dominated, last card's three options show the same outcome, pool card has one option | Every option gets a visible cost (energy for walking, board confidence for asking); differentiate the outcomes; a one-option card becomes a wire item |
| R5 | Key info hidden until after the choice: coach candidates look identical, side effects ("board gets impatient") only appear in the log, ring actions show no cost on the button, odds missing on some outcomes (workday) | Show the option subtitles and side effects on the card; a cost line under ring buttons; percentages on every chance |
| R6 | The causal log can't be trusted: only 14 entries, crowded out by daily cash; ring actions logged as "because the season started"; failures and board moves never reach the wire; the day 7 time-share choice had no settlement | Merge daily close lines; keep the player's decisions; log as "you did X"; send failures and board moves to the wire; fix the missing settlement |
| R7 | Energy never binds (back to 100 each morning, low of 65); cash piles up with nothing to buy late in the act; the ring empties after week 3; "patch roof" still offered after the roof was fixed by a card | Seasonal ring actions; walking and open days draw energy; hide finished repairs |
| R8 | Onboarding: noticeboard opens with no explanation, rejected drops give no reason (adult clinic is evening only), reputation is not on the HUD, D/C grades unexplained, unnamed dots on the map | Highlight valid cells while dragging; one-line note descriptions; reputation in the strip or details |
| R9 | Text: untranslated names and mixed terms (Coach Dale Pruitt, Hollow Creek, "Coach 士气", Pine Crown / 松冠), "这儿现在没什么可做的" wraps two characters per line, fifth strip cell clipped on phone, camera often leaves half the screen as sky | zh names table; wider ring note; strip fit at 390 px; camera framing |
| R10 | Bridge only: /plan returns the previous state; /wait/1440 sometimes runs 2,880 minutes (newcomer) | Fix in tools/playtest/server.mjs |

## Open questions

- [x] Default view: V3 (whole island, my pick) or V4 (one step closer, courts easier to follow)? Answered: whole island on load.
- [x] Should the labels toggle stay, or do the court markers (B5) replace it for good? Answered: markers replace it; the toggle is gone.
- [ ] Does the broadcast look carry into the other two acts unchanged, or does each club get its own bug color (for example Maple Ridge in school colors)?
- [x] Detailed stats (B7): a drop-down under the stat strip, or a side sheet? Answered: drop-down under the strip, with the quality chart.

## Done

On GitHub at [ETZET/tennis-director](https://github.com/ETZET/tennis-director), branch main. Playable build: [Tennis Director · Act 1](https://claude.ai/artifact/36oBECv3X1qQnAAbtgcJTd).

| Date | Change | Commit |
| --- | --- | --- |
| Oct 31 | Merged the v2 work into main and pushed all branches to GitHub (ETZET/tennis-director). | `75c5f00` |
| Oct 31 | Activity animation library ported from the prototype: 9 activities plus cleanup and pickleball, particle FX and comic text, a phone-first sandbox page (activities.html). Wired to the v2 performances: open play is doubles on the scheduled court, open day, and the workday and fundraiser actions get their own show. ADR 0010. | `6d56710, 6561090` |
| Oct 31 | Living club (tenet 6): members play on courts that are open, passers-by walk between places, leaves fall in early autumn, the pool holds water while open. | `994e1ca` |
| Oct 31 | Loop v2 phone UI: drag-based noticeboard with a weekly projection, action ring with a thumb-zone bottom sheet, event cards with who, situation and cost chips, season and energy row. Playtest bridge on 390×844, tenets 4–6, ADR 0011, reports regenerated (greedy bot 83.6%, random 20.4%; determinism gate passed). | `7df45dc, 53f6728, 01e51df` |
| Oct 31 | Loop v2 sim and content: six-week act (late summer → early autumn), daily weather, director energy that sets run speed, 16 on-site actions, noticeboard schedule with 8 programs, drift only on Sundays. | `98831b4` |
| Oct 31 | Gameplay review round 1 on the v1 loop: playtest bridge, playability metrics, cautious and walker bots; fixes for dominated options, filler repeats, dead time and hidden board confidence. | `7de6a0b, 1aad9ef` |
| Oct 30 | M3: content hot reload (edit YAML, the running game picks it up; errors open an overlay), debug panel (\` key), i18n parity check, balance pass (greedy bot wins 83.7%, random 10.4% over 1,000 games each) with a test guarding the band, and hc\_rival\_flyer added as YAML only. Content guide in docs/content-guide.md. Playable build: [Tennis Director · Act 1](https://claude.ai/artifact/JvxW8dPj16xFV54sEsbjBs) | `9117d19` |
| Oct 30 | M2: Act 1 playable in apps/game. The sim drives the island: the director walks the drawn routes (walk times derived from route length), options that need you on site walk you there and then choose, cards come from the sim with countdowns and odds, facility upgrades show on the island, activities have performances, "how we got here" causal story in the club report, autosave. | `92c1554` |
| Oct 30 | M1: sim core (clock, state, commands, storylet event engine and director, saves with migrations), Act 1 content in YAML, sim-cli. 1,000-game determinism gate passed. | `574fe4e` |
| Oct 30 | Two independent review rounds and fixes. Round 1 scores: HUD 7, world clarity 5, scene 6, HUD look 8, phone 3. Round 2: 7, 6, 6, 8.5, 5. Fixes: red clay, readable collapsed bubble, near-side fences hidden, brighter creek and footbridge, drained pool, rented marker state for Court 2, camera lifts above event cards, phone layout, paused clock, quality chart axis. Sandbox ?t= fast-forward for checking story beats. | `b81b57f, ef570b1` |
| Oct 30 | All three to-do sections: layout 5 creek divide (L1–L7), calm grass and whole-island default view (V1–V4, V3 replaced by layout 5), broadcast HUD as Preact components in packages/ui (B1–B9). ADR 0006. Preview: [Hollow Creek Sandbox](https://claude.ai/artifact/5qietdeGT5RHdNu5jnRnKY) | `62cb718` |
| Oct 30 | Render always at Fine; Pixels button removed. No water falls off the island; the creek stops at rocky banks | `35e6f54` |
| Oct 30 | Hollow Creek rebuilt as a floating island: soil and stone underside, hanging roots, drifting clouds, floating chunks, Day · Cloud and Day · Rain skies | `9d36a01` |
| Oct 30 | First island pass: Hollow Creek as an island at sea (replaced by the floating island) | `ec0fb6d` |
| Oct 30 | M0-2: Hollow Creek split into `packages/render` and `apps/sandbox`; matched the prototype pixel for pixel | `498030d`, `7cf5a16` |
| Oct 30 | M0-1: pnpm workspace, TypeScript 7, Vite 8, Vitest, Biome, layering rules, CI | `dc9b86e` |
