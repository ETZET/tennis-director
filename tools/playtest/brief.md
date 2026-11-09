# Playtest review brief · Tennis Director, Palm Oasis · staffing loop, phone (sim + HUD, no scene yet)

> **Status 2026-11-08:** the game has no scene right now. The 2.5D renderer was archived (ADR 0027) and the new 3D pixel scenes
> (where the player walks the director directly, ADR 0029) live in `apps/sandbox` and are not wired into the game yet. This brief
> reviews the simulation, cards and HUD only: places are a row of buttons on the stage instead of markers on a map, so judge
> visuals and scene layout as "not there yet", not as a defect. Rewrite this brief when the scenes come back (docs/design/backlog.md, M-B).

You are an independent playtester. You have NOT worked on this game. Judge only what a player sees.

## How to start the bridge (whoever launches the reviewer does this once)

The bridge plays the **built** game in headless Chromium. It needs `playwright-core` (or the global `playwright`).

    # normal checkout (pnpm works): build, then start
    pnpm --filter @td/game build
    node tools/playtest/server.mjs --port <PORT> --seed <SEED> --out <OUT_DIR>

    # container without a registry (this cloud box): bundle with esbuild into any folder, point --dist at it
    $S/tt/game.sh /tmp/pt-dist          # run from the repo root; $S = the scratchpad that holds tt/
    NODE_PATH=/usr/local/lib/node_modules_global \
      node tools/playtest/server.mjs --port <PORT> --seed <SEED> --dist /tmp/pt-dist --out <OUT_DIR> &

`--dist` defaults to `apps/game/dist`. `--lang zh` for Chinese text, `--desktop` for a 1280×800 viewport (phone is the
default and the one to judge). Wait until `curl -s http://127.0.0.1:<PORT>/state` answers (about 8 s). Offline
containers print a blocked-font warning; ignore it. `GET /quit` stops the bridge. To check the bridge itself:
`node tools/playtest/smoke.mjs` (starts its own bridge) or `node tools/playtest/autoplay.mjs --port <PORT>` (plays a
whole game with a dumb strategy).

## The game in one paragraph
Phone-first management sim (portrait, 390×844). You are the new director of the **Palm Oasis Racquet Club** (Indian Wells, CA), which
has been abandoned for ten years. The investors give you **sixteen weeks (112 days)**: repair the garden place by place
(8 facilities: Outer court 1, Outer courts 2–3, Practice courts, Clubhouse, Plaza, Stadium 3, Stadium 2, Stadium 1) and
hold an **exhibition match** in the rebuilt Stadium 1. Day 112 (18:00) ends the season with a score and a grade (an early
exhibition can settle sooner); cash below −$2000 ends the game (bankrupt). There are no acts or board votes: one map, one clock.
Day-to-day play is about **hiring people and putting them where they're needed**:
- **Your people**: a strip of faces along the bottom. At the start it's only you (the director) and Coach Dale. You
  are a worker too. Tap a face to pick them up, then tap a place button; or press and drag the face onto it.
- **Posts**: ongoing spots like Outer court 1's court desk (`o1_rental`), the afternoon lessons
  (`o1_lesson`) or the Clubhouse front desk (`ch_desk`). A post earns a little every round while someone is on it, but
  only during its hours (morning regulars, after-school kids, after-work adults). Pulling someone off mid-round loses
  that round. `*_upkeep` posts have no hours and keep a place in repair.
- **Jobs** (⚒): one-off work on a problem — sweep the sand off Court 1 (`o1_sweep`), put up a new net
  (`o1_net`), repair the Clubhouse (`ch_repair`), rebuild Stadium 1 (`st1_rebuild`). Most cost materials when the first
  person arrives (no cash, no start). Several people can work together up to the job's crew limit; pulling people off
  keeps the progress. **Finishing a repair restores that facility** and opens its posts and the next repair; locked jobs
  show what to fix first.
- **Places**: ten places, one button each in the row on the stage (its name, the posts that need someone, a ⚒ count). Tap it for the list of
  posts and jobs; drop a person on it and they take the only job that fits, or you choose from the list.
  Place ids: `entrance` (Main gate), `parking`, `plaza`, `clubhouse`, `stadium_1`, `stadium_2`, `stadium_3`,
  `practice`, `outer_1`, `outer_23`. Walking between places takes 13–69 game minutes.
- **Routines**: people remember the posts you put them on and walk to their next shift on their own when their
  post closes or a job ends.
- **Upkeep**: places nobody looks after slowly wear down (sand, cracks), first on screen, then in the numbers.
  Cash, members and reputation settle once a day at closing (20:00) on the day's **service rate** (how much of the demand
  someone covered); a settlement card explains why, and Sundays add a weekly review page.
- **Hiring days** start once the Clubhouse is repaired and come every two weeks; the card shows each candidate's best
  skills and weekly wage. **Other events** are occasional cards with a countdown and 1–3 options; some options send the
  director away for a while (he leaves his post). Ignored cards resolve by default. On day 85 the investors visit.
- Weather and seasons change (autumn, winter from day 36, windy spring from day 71); wind blows sand onto the courts.

## Rules for you
- Do NOT read the game's source code or content files (no `packages/`, `apps/`, YAML). Play through the bridge only.
  You may read this brief and the header comment of `tools/playtest/server.mjs` for the API.
- Do not modify anything in the repository. You cannot write report files: return your report as your final message.
- Keep to roughly 150 tool calls in total.

## How to play (HTTP bridge to the real game in headless Chromium, phone viewport)
Start your own bridge in the background (pick YOUR port from the persona note; see "How to start the bridge" above for
the exact command on this machine), then wait until `curl -s http://127.0.0.1:<PORT>/state` answers. The game is paused between your calls, like turns.

- `GET /state` — everything on screen: `day`, `clock`, `restored` ("3/8" facilities repaired), `daysLeft` (until the
  day-112 deadline), season/weather/service rate, status, stat strip (Quality, Members, Restored + days left, Cash),
  the event card (who, context, options with cost chips and hints), news ticker, place names, your people (what each
  is doing; `staffIds` lines up with `staff`), `placeIds`, `place` (the
  open place list: each row has a `target`, or `null` + the reason when locked), the open info sheet (`sheet`), and
  `outcome` once the game is over (`result` won/lost, `ending`, `day`, `headline`, `body`).
- People: `GET /pick/<person|none>` taps a face (picks it up). `GET /tap/<target>` taps a place button (target = place
  id) or a row in the open place list (target = post/job id) — with someone picked up it sends them there; otherwise it
  opens the list / the info sheet (what it is, its hours, what it earns, and each person's fit and walk time). Tapping
  a place again toggles its list, so use `/close` when unsure. `GET /assign/<person>/<target|none>` is the same as dragging a face onto a place or a list row
  (`none` = stop). `GET /sheet/<target>` reads a sheet without opening it. `GET /close` puts down / closes.
  Person and target ids are in `state.staffIds` and `state.targets`.
- `GET /answer/1|2|3` — pick an option on the current card.
- `GET /wait/<minutes>` — let time run until a card opens, the game pauses, a job finishes, the game ends, or that many
  open-hours minutes pass (max 1440; nights don't count). The reply's `waited.stop` is `cardOpened`, `pause`,
  `orderFinished`, `ended` (see `state.outcome`) or `time`; `waited.minutes` is the clock difference, so it also
  counts the skipped night (a 240 wait that crosses 20:00 may report 960). A card open on screen does not stop the
  clock by itself between your calls (the game is paused), but answer it before it counts down in later waits.
- `GET /report` — the club report (details + "How we got here" cause→effect story).
- `GET /shot/<name>` — phone screenshot; returns a PNG path you can look at with the Read tool. Take several (the
  people strip, a picked-up person, a place list, a card, the settlement card, the ending): visuals and touch layout are
  part of the experience.
- `GET /new/<seed>` — restart. `GET /errors` — console errors seen so far. `GET /quit` when done.

A good opening: answer Dale's card, send the director and Dale to `o1_sweep` (3 h of work for two), then `o1_net`, then
save for the Clubhouse (`ch_repair`, $1800) and the first hiring day. Cash is tight all game; check a job's materials
before sending people (a refused `/assign` says `rejected: cost`).

Time: 1 game minute ≈ 0.17 s real at 1× (time runs 2× faster when every busy post is covered and nothing is moving).
A card with "59 min left" gives a real player ~10 s. A club day is ~2 real minutes; the whole game is 112 days.

## Tenets the game must meet (the owner's design rules — judge against these explicitly)
1. **No menu-style operation.** Actions respond to an event or are a direct interaction with the scene / HUD. No
   "panel → submenu → button" management.
2. **Choices have trade-offs.** Every option gains something and costs something. No option better in every way.
3. **Different choices lead to different consequences.** Choices leave traces (follow-up events, people, facilities,
   endings) visible in the cause→effect story.
4. **Events are occasional and weighty.** Not a conveyor belt; each card has enough UI (who, situation, costs) to
   make the choice feel significant.
5. **Day-to-day management is hiring people and placing them** (drag or tap people onto posts and jobs; no schedule
   screen — the schedule is implicit in where you put people).
6. **Left alone, the world keeps running and the club drifts back to how you set it up**: staffed places hold,
   unattended facilities slowly wear (visible first, then in numbers); income only flows where someone works; members
   and reputation settle once a day at closing on that day's service rate, not in real time.

Also: **phone-first.** Judge thumb reach, tap target size, text legibility, overlap, and whether drag/tap flows make
sense on a 390-wide screen.

## Score each 1–10 (one line of evidence each)
| Item | What to judge |
| --- | --- |
| Meaningful choices | Real trade-offs in who goes where, who to hire, and on cards; no obviously-best option |
| Readable consequences | Before choosing you can roughly guess; after, you can tell why numbers moved |
| Pacing | Dead time vs. overload across the 16-week game (and whether the day-112 deadline feels fair) |
| Player agency | Placing people on your own initiative feels like the core; you're not just waiting for cards |
| Idle & living world | Doing nothing keeps the club stable while the world visibly moves (tenet 6) |
| Tension arc | Pressure builds toward the deadline and the exhibition; comebacks possible |
| Replay value | Different seeds / hires / styles give different stories and endings |
| Onboarding | Without instructions, the first 2 real minutes make sense |
| Phone UX | Layout, touch targets, legibility, the pick-up / drag / tap flows at 390×844 |

## Your report (final message)
1. Score table (the 9 items + average).
2. Tenet check: for each tenet, concrete violations you hit (what, game day/time).
3. Top 5 problems, most damaging first — evidence and a concrete suggested fix (content tweak or small mechanic) that
   respects the tenets.
4. Three things that work and should be kept.
5. A short play log: who you put where, who you hired, and card decisions — what you expected vs what happened.
