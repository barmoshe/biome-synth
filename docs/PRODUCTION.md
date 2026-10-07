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
- [ ] Day/night variation by the local hour: the composer holds the energy down at night; the pictures do not change yet
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

## The composer (on the device)

Bar, 2026-10-07: smart procedural generative music instead of depending on Claude and Lyria.

- [x] Listens: phrases end after a bar of silence or two bars of playing; engagement per bar
- [x] Learns: a second-order Markov model over intervals and onsets, trained on each world's idiom and the player's phrases (tested)
- [x] Answers each phrase in the world's lead voice, ending on the tonic; stops when the player plays again (tested)
- [x] Takes the player's phrase as the theme and develops it per section; the theme travels between worlds (tested, and played live)
- [x] Chord walks on each genre's graph, ending on a chord that leads home (tested)
- [x] Form follows the player: busy reaches the surge, idle never does, the night holds energy down (tested)
- [x] The band's lead steps back while the player plays (tested)
- [x] The retired AI code is gone: the files, the streamed-bed player, the SDK, Hono and the Worker config

## Engineering

- [x] CI on GitHub: typecheck, tests, build (green)
- [x] Production build: 107 KB gzipped JS + 15 KB worklet
- [ ] Deploy: now a static site (no server), so any static host works, including a bar-builds.com subdomain on Vercel where the DNS already points
- [ ] A license (Bar's call)
