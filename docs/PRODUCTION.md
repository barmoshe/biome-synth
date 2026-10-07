# Production checklist

Bar, 2026-10-07: "this feels like a POC, I want a full production ready product", "build all first,
make it the best you can before deploy". Each line is done when it is verified, not when it is written.

## Music: every world is its own place

- [ ] Per-world identity: tempo, meter and groove, drum kit, harmony vocabulary, signature effects,
      and a generative mechanic of its own (research: `docs/research/worlds.md`)
- [ ] Per-world effects in the engine: dub delay throws, sidechain pump, filter sweeps, tape wobble
- [ ] Borders as DJ transitions: filter sweep, riser, fill, a cut on the downbeat
- [ ] Creatures solo now and then; the band answers the player

## Worlds that live

- [ ] Ambient actors per biome (shooting stars, fish schools, birds, cars, aurora gusts)
- [ ] Day/night or weather variation per visit
- [ ] Performance: world paint off the main thread or chunked; 60 fps on a mid phone

## Product

- [ ] First-run guidance that teaches by doing (tap a creature, slide the sky, flick)
- [ ] Loading state while the world paints
- [ ] Settings: volume, mute, motion, drift; remembered per device
- [ ] Record and share a clip (canvas + audio to video, Web Share or download)
- [ ] PWA: manifest, icons, offline after the first visit
- [ ] Share image, title, description
- [ ] Errors: unsupported browser (no AudioWorklet) message, error boundary, audio interruption recovery
- [ ] Accessibility: keyboard play, reduced motion, screen-reader labels, focus order
- [ ] Mobile: portrait layout, safe areas, touch targets, iOS silent switch
- [ ] README with screenshots and how it works

## AI band

- [ ] Claude conductor: `/api/compose` with a tool schema, fixture mode, rate limits, budget switch
- [ ] Lyria bed: token or relay, PCM worklet player, position-weighted prompts, session cap, disclosure
- [ ] Both absent without configuration: the local band carries everything, no errors

## Engineering

- [ ] CI on GitHub: typecheck, tests, build
- [ ] Bundle budget and a production build check
- [ ] Deploy: Cloudflare Worker on a bar-builds.com subdomain
