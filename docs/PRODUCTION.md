# Production checklist

Bar, 2026-10-07: "this feels like a POC, I want a full production ready product", "build all first,
make it the best you can before deploy". Each line is checked when it is verified, not when it is written.

## Music: every world is its own place

- [x] Per-world identity: tempo, meter and groove, kit, harmony, effects and a mechanic of its own
      (`docs/research/worlds.md`; tests assert distinct clocks and kits, key, swing, the T-voice rule)
- [x] Per-world effects in the engine: room and hall, dub delay throws, sidechain pump, tape wobble, tape stop, bitcrush
- [x] Borders as DJ transitions: drumless bridge, tempo glide, filter sweeps, power cut (tested)
- [x] Creatures solo when left alone; Canopy's parrot answers the player
- [x] Loudness matched across worlds (offline renders, RMS 0.11-0.15)

## Worlds that live

- [x] Ambient life per biome (shooting stars, rover, caribou, geese, fish, manta, birds, butterflies, leaves, cars, searchlights)
- [ ] Day/night variation by the local hour (the conductor passes `daylight`; nothing uses it yet)
- [x] Performance: 1.2-3.9 ms per frame headless (`SNAP=perf`); world paint about 0.9 s behind a loader

## Product

- [x] First-run guide that teaches by doing, skippable, remembered
- [x] Loading state while the world paints
- [x] Settings: volume, mute, motion, camera; remembered per device
- [x] Record and share a clip (canvas + audio, MP4 or WebM, Web Share or download)
- [x] PWA: manifest, icons, offline after the first visit
- [x] Share image, title, description
- [x] Errors: no AudioWorklet, audio blocked, an error boundary; iOS audio session and interruptions
- [x] Accessibility: keyboard play, reduced motion, labels, live region
- [x] Mobile: portrait scale and layout (checked at 375x812), safe areas
- [x] README with screenshots and how it works

## AI band

- [x] Claude conductor: `/api/compose`, structured output, cached prompt, fallback, rate limit, kill switch, fixture mode
- [x] Lyria bed: Worker relay (protocol from @google/genai 2.27.0), PCM worklet, position-weighted prompts, session cap, disclosure
- [x] Both absent without keys: the menu says "not set up", the local band carries everything (tested)
- [ ] Live check with real keys (needs Bar's Anthropic and Gemini keys as Worker secrets)

## Engineering

- [x] CI on GitHub: typecheck, tests, build (green)
- [x] Production build: 107 KB gzipped JS + 15 KB worklet
- [ ] Deploy: Cloudflare Worker on a bar-builds.com subdomain (DNS is at GoDaddy; needs Bar's call)
- [ ] A license (Bar's call)
