# Biome Synth (reinvented) - STATUS

A pixel-art world you play: one looping side-scroller (Orbit, Aurora, Deep, Canopy, Neon), every
creature is a voice, a local band plus Claude as conductor, an optional Lyria RealTime bed.
Plan: `~/.claude/plans/i-made-the-biome-bright-liskov.md` (approved 2026-10-07).

## Steps

| # | Step | Commit | Outcome |
|---|---|---|---|
| 2 | Sound first: worklet voices, procedural beds, clock, sections, band, conductor | (this commit) | 34 unit tests pass: voices clean and finite, sample-accurate starts, no drift, clamp golden set, all notes in key |

## Deviations from the plan

- Ambient beds are synthesized, not the original's recordings: two of those had unclear licences.
