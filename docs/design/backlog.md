# Indian Wells · Change Backlog

Oct 31, 2026 · @Enting · rewritten Nov 1, 2026 for the single Indian Wells map

The running to-do list for the game. The game now runs on one map, the abandoned Indian Wells Tennis Garden (ADR 0016); the Hollow Creek backlog that used to live here is archived at the bottom. Items keep their IDs when they move between sections. Add new feedback under the right section with a new ID.

How the game works now: [game-design.md](game-design.md) (v0.3). How it is tested: [testing.md](testing.md) (v0.2). How we got here: [indian-wells-migration.md](indian-wells-migration.md) and `docs/adr/`.

## Now · in priority order

| # | Item | Why now | Status |
| --- | --- | --- | --- |
| N1 | Indian Wells review round 1: a newcomer and a veteran review agent each play a full 16-week game on phone through the playtest bridge, plus an idle control run; score the 9 items against tenets 1–6 | P1-7 was only done with bots. Nobody has played the Indian Wells loop yet, and every tuning decision below waits on it | To do |
| N2 | Human playtest of the preview (you): first 20 minutes on phone | Checks onboarding (IW-02, IW-05, IW-06 in testing.md) and whether 16 weeks feels right | To do |
| N3 | Fix round 1 findings | Unknown until N1 and N2 | Blocked on N1 |
| N4 | Mid-game cards (weeks 8–14 are quiet): staff friction, a rival club, the press, the sponsor's follow-up | Only 12 cards; the playability report shows long card-free stretches late in the game | To do |
| N5 | Deadline length and difficulty after N1/N2: keep 16 weeks, widen it, or offer two lengths | The greedy bot finishes on day 91–111 out of 112; a human may not | Blocked on N1, N2 |
| N6 | Delete the merged branches on GitHub: `feat/indian-wells`, `chore/remove-hollow-creek`, `design/core-loop-staffing`, `design/indian-wells-single-map`, `animlib-port` | Cloud sessions can't delete branches | Blocked (by hand) |

## Gameplay and content

| # | Item | Note | Status |
| --- | --- | --- | --- |
| G1 | Dale's story: why he stayed ten years; beats at the clubhouse, Stadium 2 and the exhibition | Two cards today (arrival, last tournament); `dale_umpire` already feeds the exhibition odds | To do |
| G2 | Desert heat: midday heat in autumn and spring lowers outdoor demand and work speed; wind adds decay | Today wind is one card plus blowing sand on screen; heat is not modelled | To do |
| G3 | Staff roles: decide whether posts take anyone or only a role (court crew, coach, desk/ball kid) | Today everyone has three skills and can take any post | Open question |
| G4 | Reputation saturates at 100 for a good player; give it a late-game use (sponsors, media, bigger events) | Seen in bot runs | To do |
| G5 | After the exhibition: continue into a "real tournament" season, or end there | Cash has nowhere to go after Stadium 1 | Open question |
| G6 | Tryout day | Not built: hiring cards already show skills and wage (ADR 0016). Revisit if candidates' skills become partly hidden | Parked |
| G7 | Demand that grows with the garden: more and different visitors as places reopen (families at the plaza, pros at Stadium 2) | Partly there through per-post income formulas | To do |
| G8 | Rename the content layer "act" to "site" | Cosmetic; wait for a second map (ADR 0016) | Parked |

## Visuals (P3)

| # | Item | Note | Status |
| --- | --- | --- | --- |
| V1 | Detailed abandoned scene: rebuild Indian Wells in the Palm Oasis style with the concept's decay (faded seats, cracks, sand, the collapsed Stadium 1 corner, mountains, tumbleweeds, crows), replacing the greybox behind the same `Site` interface | Concept: the subagent demo; the user liked the backdrop, the sanded parking lot and the collapsed corner | To do |
| V2 | Repaired look per facility (replaces the greybox overlays one by one) | Overlays exist per facility state | To do |
| V3 | Facility condition visible before the numbers drop: sand drifts, weeds and litter grow as condition falls (tenet 6) | Was P10. Today only the state change is drawn, not the slow decay | To do |
| V4 | Posts as seats with a ring and jobs as markers with a bar, drawn in the scene (decided Nov 1) | Today progress is on the place hubs and lists | To do |
| V5 | Work gestures for staff at posts without a performance (desk, upkeep, plaza) | Was P11 | To do |
| V6 | Time of day and weather looks: dawn, dusk, night, wind, heat | Was O4 | To do |
| V7 | Upgrade three.js from r128 and retune lighting | Was O2 (M0-3) | To do |
| V8 | Visual regression for Indian Wells: four angles × abandoned and fully repaired, plus a rotation flicker check | Removed with Hollow Creek in #6 | Blocked on V1 |

## UI and phone

| # | Item | Note | Status |
| --- | --- | --- | --- |
| U1 | Check place hubs on the Indian Wells layout (10 places, a much bigger map): stacking, hubs far from their place, compact dots when zoomed out | Was P17 on Hollow Creek | To do |
| U2 | Default camera on phone: frame the whole garden, with the mountains behind | Tuned once from screenshots; check on real phones | To do |
| U3 | Restoration cell: tie its colour to the pace needed to make the deadline, and explain it on tap | Today it turns red when fewer than 10 days are left per unrepaired place | To do |

## Tests and tools

| # | Item | Note | Status |
| --- | --- | --- | --- |
| T1 | End-to-end smoke test (Playwright): start, sweep, net, save, reload, same state | testing.md "待补的测试" | To do |
| T2 | Render vs headless determinism: one game in the browser and headless, same state hash | testing.md | To do |
| T3 | Replay set: one command log per fixed bug | testing.md | To do |
| T4 | Frame rate, draw calls and first load on real phones for the bigger map | testing.md | To do |

## Open questions

- [ ] Deadline: 16 weeks for everyone, or difficulty levels? (N5)
- [ ] Staff roles, or skills only? (G3)
- [ ] What happens after the exhibition? (G5)

## Done

On GitHub at [ETZET/tennis-director](https://github.com/ETZET/tennis-director), branch main. Playable preview: [Indian Wells 灰盒](https://claude.ai/artifact/VbYaaKrg8f5NYdnPvZHJgP).

| Date | Change | Commit |
| --- | --- | --- |
| Nov 1 | Main game moved onto Indian Wells (P0 + P1, PR #7): `Site` interface and a greybox scene with ruined and repaired layers per facility; 8 facilities in a repair chain, 19 posts, 22 jobs, Dale and 8 candidates, 12 cards; exhibition win with a turnout check, 16-week deadline and bankruptcy; hiring days every two weeks; director growth on the wire; the camera visits a repair; locked repairs say what to fix first; cross-act inheritance removed (save v5); bots, balance band and playtest brief ported. Greedy bot 99%, cautious (never hires) 0%, random 0%, idle 0%. ADR 0016 | `620d426` |
| Nov 1 | Removed the Hollow Creek demo, prototype, screenshot regression and act content (PR #6) | `2af0c58` |
| Nov 1 | Design: single Indian Wells map, three acts dropped; migration plan and priorities | `0c4618b`, `848425a` |
| Nov 1 | Core-loop pivot recorded: staffing management sim, posts vs one-off jobs, implicit scheduling, tenet 6 rewritten | `f1718af`…`588c3a3` |
| Nov 1 | Round 2 fixes S1–S12 on the Hollow Creek staffing loop (hire chips, condition warnings, routine fallback, repeat caps, option side effects, rain rows) | `625059a`, `1a92fad` |
| Nov 1 | Routines, place hubs, jobs that unlock from repairs (ADR 0013–0015) | — |
| Oct 31 | Staffing loop: staff, posts, jobs, condition decay, `assign`, save v3; phone UI with the staff strip; bots and balance (ADR 0012) | — |
| Oct 31 | Activity animation library ported (ADR 0010); living club; loop v2 (later replaced) | `6d56710`, `994e1ca`, `7df45dc` |
| Oct 30 | M3: content hot reload, debug panel, i18n parity, balance band, content guide | `9117d19` |
| Oct 30 | M2: Act 1 playable in apps/game | `92c1554` |
| Oct 30 | M1: sim core, content in YAML, sim-cli, 1,000-game determinism gate | `574fe4e` |
| Oct 30 | M0: workspace, TypeScript 7, Vite 8, Vitest, Biome, layering rules, CI; Hollow Creek split into packages/render | `dc9b86e`, `498030d` |

## Archive · Hollow Creek (Oct 30 – Nov 1)

The Hollow Creek act, its floating-island scene and its backlog were retired on Nov 1 (ADR 0016). The full old backlog, with the broadcast-HUD and layout work (B1–B9, V1–V4, L1–L7), is in the git history of this file before `620d426`. Kept here because the lessons still apply:

- **Review round 1** (Nov 1, noticeboard loop): newcomer 5.0, veteran 4.4. The worst item was the tension arc (3 and 2). Main findings: one dominant plan, repeated cards, free options and a causal log that couldn't be trusted (R1–R10).
- **Review round 2** (Nov 1, staffing loop with hubs and routines): 5.0 and 5.0. Both reviewers kept the hub → list → send flow, routines, the card layout and the cause→effect story. Findings S1–S12 were fixed. The one left open was late-game pressure: the board vote was settled by week 4.
- **What carries over to Indian Wells:** an open-ended goal kills tension (hence the deadline); hiring must not be blind (hence the hire chips); every option needs a visible cost; cards must not repeat. Decay must show on screen before it shows in the numbers (that is still V3).
