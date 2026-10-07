# Biome Synth (reinvented) - STATUS

A pixel-art world you play: one looping side-scroller (Orbit, Aurora, Deep, Canopy, Neon), every
creature is an instrument, each world its own genre, and a composer on the device that listens to
the player (it replaced the Claude conductor and the Lyria bed on 2026-10-07).
Plan: `~/.claude/plans/i-made-the-biome-bright-liskov.md` (approved 2026-10-07). Production
checklist: `docs/PRODUCTION.md`. Workshop pointer: `bar_builds/lab/personal/biome-synth`, ADR 0544.

## Steps

| # | Step | Commit | Outcome |
|---|---|---|---|
| 2 | Sound first: worklet voices, procedural beds, clock, sections, band, conductor | 6e44f5d | 34 tests: voices clean and finite, sample-accurate starts, no drift, clamp golden set, all notes in key |
| 3+5 | Pixel world v1: five biomes, playable critters, HUD | ea6b1fe | Played in the browser pane: band running, 10 voices, peak 0.34, no console errors |
| 3+5 | Art v2 at 270 px: shade tables, atmosphere, compositor, foreground, all biomes redrawn | 6cc6b79 | Headless PNG renders of every biome and border |
| 4b | Drags and slides: ribbon, strum, speed-shaped notes, stirred weather, flung star | c626911 | Play-tested in the browser: tap, slide (ribbon 258 points), strum (once per pass), flick (cascade) |
| - | Start in Orbit | 760796f | Opens on Orbit |
| - | Living scenery in every biome | b37f0e2 | Rendered headlessly |
| 4 | Five worlds, five genres, DJ transitions (research: `docs/research/worlds.md`) | 5236a45 | 48 tests; full journey played live in the browser, all four crossings |
| 4 | Loudness trims, offline WAV renders | 79ebd60 | RMS 0.11-0.15 across worlds, no clipping; WAVs sent to Bar |
| 8 | Product: loader, menu, settings, guide, idle solos, recording, errors, phones | a1b3b40 | Checked at 1512x760 and 375x812 |
| 6+7 | Claude conductor and Lyria bed through one Worker | 8bb0a71 | 57 tests; Worker checked live with the fixture conductor (status, compose, production build) |
| 8 | PWA, icons, share image, README, CI | bdda65b | CI green |
| 8 | Tile-mapped layer drawing | 544c162 | Frame cost about 12 ms to 1.2-3.9 ms headless |
| 9 | On-device composer replaces Claude and Lyria: listens, learns, answers, develops the player's theme, chord walks, form that follows the player | (this commit) | 67 tests; played live: a 5-note phrase was answered, became the theme in Orbit, and carried into Neon; no console errors |

## Next (needs Bar)

- Delete the retired AI files (the agent's delete was blocked): `src/ai/`, `src/worker/`,
  `tests/worker.test.ts`, `tsconfig.worker.json`, the `pcm-bed` processor in `src/audio/worklet.ts`
  with `bedPlayer`/`bedIn`/`setBedLevel` in `src/audio/engine.ts`, the `@anthropic-ai/sdk`, `hono` and
  `@cloudflare/workers-types` packages, and `main`/`vars`/`ratelimits` in `wrangler.jsonc`.
- Play it and react to the composer (answers, themes).
- The deploy target: now a static site, so a bar-builds.com subdomain on Vercel works with the DNS as it is.
- A license.

## Deviations from the plan

- Ambient beds are synthesized, not the original's recordings: two of those had unclear licences.
- Resolution raised from 180 to 270 art px after a pixel-art research pass (Bar asked for higher resolution and better art).
- Worlds became distinct genres with their own clocks instead of one shared band (Bar: the worlds needed more difference).
- The AI band (Claude conductor, Lyria bed, Worker) was built, then replaced by an on-device composer: Bar wanted no dependence on outside services or keys (2026-10-07).
