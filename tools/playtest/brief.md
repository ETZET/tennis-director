# Playtest review brief · Tennis Director, Act 1 (Hollow Creek) · staffing loop, phone

You are an independent playtester. You have NOT worked on this game. Judge only what a player sees.

## The game in one paragraph
Phone-first management sim (portrait, 390×844). You are the new director of a failing community tennis club. Act 1
runs six weeks, late summer → early autumn; at the end (day 42) the board votes whether to keep the club.
Day-to-day play is about **hiring people and putting them where they're needed**:
- **Your people**: a strip of faces along the bottom. At the start it's only you (the director) and Coach Dale. You
  are a worker too. Tap a face to pick them up, then tap a marker in the scene; or press and drag the face onto it.
- **Posts** (round markers): ongoing spots like Court 1's junior lesson, the deck host in the morning, upkeep. A post
  earns a little every round while someone is on it, but only during its hours (morning regulars, after-school kids,
  after-work adults). Pulling someone off mid-round loses that round.
- **Jobs** (⚒ markers): one-off work on a problem — weeds, cracks, the collapsed bubble. Some cost materials. Several
  people can work together; pulling people off keeps the progress.
- **Places**: each place on the island has one marker (its name, the posts that need someone, and a ⚒ count). Tap it
  for the place's list of posts and jobs; drop a person on it and they take the only job that fits, or you choose
  from the list. Locked jobs show what to fix first.
- **Routines**: people remember the posts you put them on and walk to their next shift on their own when their
  post closes or a job ends.
- **Upkeep**: places nobody looks after slowly wear down (weeds, leaves), first on screen, then in the numbers.
  Members and reputation settle each Sunday on the week's **service rate** (how much of the demand someone covered).
- **Hiring days** and other events are occasional cards with a countdown and 1–3 options; some options send the
  director away for a while (he leaves his post). Ignored cards resolve by default.
- Weather and seasons change; rain closes outdoor courts; autumn brings more leaves.

## Rules for you
- Do NOT read the game's source code or content files (no `packages/`, `apps/`, YAML). Play through the bridge only.
  You may read this brief and the header comment of `tools/playtest/server.mjs` for the API.
- Do not modify anything in the repository. You cannot write report files: return your report as your final message.
- Keep to roughly 150 tool calls in total.

## How to play (HTTP bridge to the real game in headless Chromium, phone viewport)
Start your own bridge in the background (pick YOUR port from the persona note), from /home/claude/tennis-director:

    node tools/playtest/server.mjs --port <PORT> --seed <SEED> --out <YOUR_OUT_DIR>

Wait until `curl -s http://127.0.0.1:<PORT>/state` answers. The game is paused between your calls, like turns.

- `GET /state` — everything on screen: clock, season/weather/service rate, status, stat strip, the event card (who,
  context, options with cost chips and hints), news ticker, place names, your people (what each is doing), the post and
  job markers visible in the scene, the open info sheet, outcome.
- People: `GET /pick/<person|none>` taps a face (picks it up). `GET /tap/<target>` taps a place marker (target = place id) or a row in the open place list (target = post/job id)
  — with someone picked up it sends them there; otherwise it opens the list / the info sheet (what it is, its hours, what it earns, and each
  person's fit and walk time). `GET /assign/<person>/<target|none>` is the same as dragging a face onto a marker
  (`none` = stop). `GET /sheet/<target>` reads a sheet without opening it. `GET /close` puts down / closes.
  Person and target ids are in `state.staffIds` and `state.targets`.
- `GET /answer/1|2|3` — pick an option on the current card.
- `GET /wait/<minutes>` — let time run until a card opens, the game pauses, a job finishes, the act ends, or that many
  open-hours minutes pass (max 1440; nights don't count).
- `GET /report` — the club report (details + "How we got here" cause→effect story).
- `GET /shot/<name>` — phone screenshot; returns a PNG path you can look at with the Read tool. Take several (the
  people strip, a picked-up person, an info sheet, a card, a quiet moment, the ending): visuals and touch layout are
  part of the experience.
- `GET /new/<seed>` — restart. `GET /quit` when done.

Time: 1 game minute ≈ 0.17 s real at 1× (time runs 2× faster when every busy post is covered and nothing is moving).
A card with "59 min left" gives a real player ~10 s. A club day is ~2 real minutes.

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
   and reputation settle on weekly averages, not in real time.

Also: **phone-first.** Judge thumb reach, tap target size, text legibility, overlap, and whether drag/tap flows make
sense on a 390-wide screen.

## Score each 1–10 (one line of evidence each)
| Item | What to judge |
| --- | --- |
| Meaningful choices | Real trade-offs in who goes where, who to hire, and on cards; no obviously-best option |
| Readable consequences | Before choosing you can roughly guess; after, you can tell why numbers moved |
| Pacing | Dead time vs. overload across a 6-week act |
| Player agency | Placing people on your own initiative feels like the core; you're not just waiting for cards |
| Idle & living world | Doing nothing keeps the club stable while the world visibly moves (tenet 6) |
| Tension arc | Pressure builds toward the board vote; comebacks possible |
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
