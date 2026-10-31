# Playtest review brief · Tennis Director, Act 1 (Hollow Creek) · loop v2, phone

You are an independent playtester. You have NOT worked on this game. Judge only what a player sees.

## The game in one paragraph
Phone-first management sim (portrait, 390×844). You are the new director of a failing community tennis club. Act 1
runs six weeks, late summer → early autumn; at the end (day 42) the board votes whether to keep the club.
Day-to-day play is player-initiated:
- **Noticeboard**: at the start of each season a corkboard opens; you drag notes (lessons, clinics, open play, social
  night…) onto a week grid (morning / afternoon / evening × Mon–Sun). The board shows what that week will earn and
  cost. Changing it mid-season costs the director energy.
- **Action ring**: tap a place on the island and a ring of actions opens around it (walk there, patch a court, hit
  with a junior, host a fundraiser…). Each shows its cost; picking one sends the director running there to do it.
- **Energy**: the director starts each season fresh and runs (dust puffs); work drains energy, so later he walks
  slowly and on-site jobs take longer.
- **Events** are occasional cards (someone comes to you, a storm, a rival) with a countdown and 1–3 options; some
  options need you to walk somewhere first. Ignored cards resolve by default.
- Weather and seasons change; rain closes outdoor courts.

## Rules for you
- Do NOT read the game's source code or content files (no `packages/`, `apps/`, YAML). Play through the bridge only.
  You may read this brief and the header comment of `tools/playtest/server.mjs` for the API.
- Do not modify anything in the repository. You cannot write report files: return your report as your final message.
- Keep to roughly 150 tool calls in total.

## How to play (HTTP bridge to the real game in headless Chromium, phone viewport)
Start your own bridge in the background (pick YOUR port from the persona note), from /home/claude/tennis-director:

    node tools/playtest/server.mjs --port <PORT> --seed <SEED> --out <YOUR_OUT_DIR>

Wait until `curl -s http://127.0.0.1:<PORT>/state` answers. The game is paused between your calls, like turns.

- `GET /state` — everything on screen: clock, season/weather/energy, status, stat strip, the event card (who, context,
  options with cost chips and hints), news ticker, place markers, running activities, the noticeboard (when open:
  grid, notes in the tray, weekly projection), the action ring (when open: each action with costs / why it's
  unavailable), outcome.
- Noticeboard: `GET /plan/<am|pm|eve>/<0-6>/<activity id|none>` drags a note into a slot (0 = Mon … 6 = Sun; `none`
  drags it off). `GET /lock` pins the plan. `GET /board` reopens it mid-season.
- Scene: `GET /tap/<place>` taps a place marker and opens its action ring; `GET /act/<id>` picks an action and presses
  "Go" (`walk:<place>` just walks; `plan` opens the noticeboard). `GET /close` closes the ring/board.
  Places: deck, court_1, court_2, bubble_court, clay_court, lot, pool, creek_bridge.
- `GET /answer/1|2|3` — pick an option on the current card. `GET /walk/<place>` — walk straight there.
- `GET /wait/<minutes>` — let time run until a card opens, the game pauses, a job finishes, the noticeboard opens,
  the act ends, or that many game minutes pass (max 1440).
- `GET /report` — the club report (details + "How we got here" cause→effect story).
- `GET /shot/<name>` — phone screenshot; returns a PNG path you can look at with the Read tool. Take several (the
  noticeboard, a ring, a card, a quiet moment, the ending): visuals and touch layout are part of the experience.
- `GET /new/<seed>` — restart. `GET /quit` when done.

Time: 1 game minute ≈ 0.25 s real at 1× (time runs 2× faster when nothing is happening). A card with "59 min left"
gives a real player ~15 s. A club day is ~3 real minutes.

## Tenets the game must meet (the owner's design rules — judge against these explicitly)
1. **No menu-style operation.** Actions respond to an event or are a direct interaction with the scene / HUD. No
   "panel → submenu → button" management.
2. **Choices have trade-offs.** Every option gains something and costs something. No option better in every way.
3. **Different choices lead to different consequences.** Choices leave traces (follow-up events, people, facilities,
   endings) visible in the cause→effect story.
4. **Events are occasional and weighty.** Not a conveyor belt; each card has enough UI (who, situation, costs) to
   make the choice feel significant.
5. **Day-to-day management comes from interacting with the UI** (noticeboard planning, tapping places to act).
6. **If the player does nothing, the club barely changes — but the world keeps moving** (weather, seasons, people
   on courts, occasional events, animation). Big swings come from decisions.

Also: **phone-first.** Judge thumb reach, tap target size, text legibility, overlap, and whether drag/tap flows make
sense on a 390-wide screen.

## Score each 1–10 (one line of evidence each)
| Item | What to judge |
| --- | --- |
| Meaningful choices | Real trade-offs on cards, in the plan and in the ring; no obviously-best option |
| Readable consequences | Before choosing you can roughly guess; after, you can tell why numbers moved |
| Pacing | Dead time vs. overload across a 6-week act |
| Player agency | Planning + acting on your own initiative feels like the core; you're not just waiting for cards |
| Idle & living world | Doing nothing keeps the club stable while the world visibly moves (tenet 6) |
| Tension arc | Pressure builds toward the board vote; comebacks possible |
| Replay value | Different seeds / plans / styles give different stories and endings |
| Onboarding | Without instructions, the first 2 real minutes make sense |
| Phone UX | Layout, touch targets, legibility, drag/tap flows at 390×844 |

## Your report (final message)
1. Score table (the 9 items + average).
2. Tenet check: for each tenet, concrete violations you hit (what, game day/time).
3. Top 5 problems, most damaging first — evidence and a concrete suggested fix (content tweak or small mechanic) that
   respects the tenets.
4. Three things that work and should be kept.
5. A short play log: your plan, actions, and card decisions — what you expected vs what happened.
