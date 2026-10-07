# Biome Synth (reinvented) - STATUS

A pixel-art world you play: one looping side-scroller (Orbit, Aurora, Deep, Canopy, Neon), every
creature is a voice, a local band plus Claude as conductor, an optional Lyria RealTime bed.
Plan: `~/.claude/plans/i-made-the-biome-bright-liskov.md` (approved 2026-10-07).

## Steps

| # | Step | Commit | Outcome |
|---|---|---|---|
| 2 | Sound first: worklet voices, procedural beds, clock, sections, band, conductor | 6e44f5d | 34 unit tests pass: voices clean and finite, sample-accurate starts, no drift, clamp golden set, all notes in key |
| 3+5 | Pixel world v1: five biomes, playable critters, HUD | ea6b1fe | Rendered in the browser pane: band playing, 10 voices, peak 0.34, no console errors |
| 3+5 | Art v2 at 270 px: shade tables, atmosphere, compositor, foreground, all biomes redrawn | 6cc6b79 | Headless PNG renders of every biome and border (`SNAP=1 npx vitest run`); world paints in ~0.9 s |
| 4b | Drags and slides: ribbon, strum, speed-shaped notes, stirred weather, flung star | c626911 | Typecheck + tests pass; drag render checked headlessly; touch feel not yet checked in a browser |

## Next

- Play-test the drag and strum feel in a browser (the dev server was stopped by Bar mid-session; restart only when asked).
- Step 6: Claude conductor (`/api/compose` Worker + tool schema), fixture mode first.
- Steps 0/1 (business scope, need Bar): knowledge entry for Lyria RealTime, `.repos.json`, pointer folder, ADR, GitHub repo.
- Step 7: Lyria bed, needs a Gemini key.

## Deviations from the plan

- Ambient beds are synthesized, not the original's recordings: two of those had unclear licences.
- Resolution raised from 180 to 270 art px after a pixel-art research pass (Bar asked for higher resolution and better art).
