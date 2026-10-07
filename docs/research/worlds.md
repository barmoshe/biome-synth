# Five worlds, five genres (design brief, 2026-10-07)

Bar's feedback: the original's worlds felt more different from each other; each environment needs
its own vibe, drums and tempo. This brief (a research pass, sources at the end) is what the music
engine implements. The tempo arc across the journey: Aurora ~60 (free time) < Orbit 96 < Deep 118 <
Canopy 12/8 at about 108 per dotted quarter < Neon 132 with swing. Keys are chained so neighbours
share notes.

Engine requirements: steps per bar per world (16, 12, or free time), per-world swing, a "breath"
scheduler for Aurora (jittered, irregular events on the lookahead clock).

| World | Genre | bpm | Meter | Swing | Scale / root | Kit | Effects | Mechanic |
|---|---|---|---|---|---|---|---|---|
| Orbit | Kosmische sequencer (Tangerine Dream, Schulze, Eno's *Apollo*) | 96 | 4/4 + 7-step ostinato (7:16) | 0 | D Lydian, D pedal | sub thrum, pulse blips, LFSR solar wind | 8 s reverb, tape wobble | Kepler orbits: each creature sounds every P steps; a tap changes its orbit |
| Aurora | Tintinnabuli (Pärt), arctic ambient (Biosphere) | ~60 nominal | free (breaths of 3-7 pulses, jitter) | n/a | B Aeolian, B-minor triad | ice crack, frame drum, snow grains | shimmer-like long reverb, freeze | M-voice by step, automatic T-voice on the nearest triad tone |
| Deep | Dub techno (Basic Channel), Debussy's open fifths, Yoshimura | 118 | 4/4 | 54% | E Dorian, Em11 / A13 | bubble kick, hiss hats, water drop, sonar ping | dotted-8th tape delay with LP in the loop, depth LP | dub throws: a tap sends the note into a rising-feedback delay |
| Canopy | 12/8 bell timelines, Afrobeat polyrhythm, kotekan | dotted-quarter 108 | 12/8 | ternary, humanized | A major pentatonic, A-D-E | bembe bell, log drum, shaker, woodblock, dotted-quarter kick | dry room, saturation | hocket pairs + Euclidean E(k,12) per creature + call and response |
| Neon | UK 2-step (Burial), Blade Runner brass | 132 | 4/4 | 58% | F# minor, m9, i-VI-III-VII | skipping kick, gated clap, metallic hats, woodblock, crackle | sidechain pump, gated reverb, bitcrush | creatures as arp voices; kick placement mutates every 2 bars; tap fires a vox chop |

## Transitions (on phrase boundaries; never two kicks at once; tempo ramps only while beatless)

- Orbit to Aurora, dissolve: the ostinato slows over 4 bars, the grid drops away; D and F# pivot into the B-minor drone.
- Aurora to Deep, submerge: master LP sweeps down over 2 bars; same seven notes (B Aeolian / E Dorian), only the bass root moves; the last bell is thrown into the delay; the kick enters on a downbeat.
- Deep to Canopy, surface: drums drop, a rising riser, the delay goes to triplets to seed 12/8, the tempo ramps in the beatless bar, a talking-drum fill lands on the 1.
- Canopy to Neon, power cut: a tape stop, a bar of rain, a hard cut into kick and sub on the downbeat.
- Neon to Orbit, lift-off: a high-pass sweep and riser, the sidechain releases, the drums drop, a half-time fall into the float.

## Cross-cutting

Local hour shapes brightness and density (Endel); creature stems fade by distance (Proteus); hidden
combos per world (Incredibox); an auto-harmonising chorus (Blob Opera); parameter-vector blending
in border zones (Lyria RealTime style); intensity tiers from activity; idle self-play after 20 s
(Bloom); each world's palette locked to its sound (Patatap).

## Sources (accessed 2026-10-07)

Kosmische: tangerinedreammusic.com/great-ost/kosmische-music.html. Apollo: en.wikipedia.org/wiki/Apollo:_Atmospheres_and_Soundtracks.
Tintinnabuli: researchcatalogue.net/view/3795800/3796035; arvopart.ee (formal algorithms of tintinnabuli). Biosphere: en.wikipedia.org/wiki/Biosphere_(musician).
Dub techno: en.wikipedia.org/wiki/Dub_techno; attackmagazine.com (Basic Channel style dub techno). Bloom: en.wikipedia.org/wiki/Bloom_(software); enoshop.co.uk (Bloom: Living World).
La cathédrale engloutie: en.wikipedia.org. Hiroshi Yoshimura: en.wikipedia.org. Afrobeat: rollingstone.com (Tony Allen); moderndrummer.com.
Clave and bell patterns: en.wikipedia.org/wiki/Clave_(rhythm); Toussaint, cgm.cs.mcgill.ca/~godfried/publications/banff.pdf; en.wikipedia.org/wiki/Euclidean_rhythm. Kotekan: en.wikipedia.org/wiki/Kotekan.
2-step: en.wikipedia.org/wiki/2-step_garage; musicradar.com (UK garage tutorial). Untrue: en.wikipedia.org. Blade Runner sounds: reverbmachine.com; musictech.com.
Synthwave: violetrecording.com; DJ transitions: mixgraph.io; harmonic mixing: stemsplit.io. Shepard tones: splice.com.
Endel, Proteus, Incredibox, Tetris Effect: en.wikipedia.org. Blob Opera: experiments.withgoogle.com. Lyria RealTime: deepmind.google, ai.google.dev. No Man's Sky: engadget.com. Patatap: creativereview.co.uk.
Unsourced design calls: the 6-square metallic hat, the droplet chirp, Kepler period scaling, the key chain, bpm and swing figures beyond cited ranges.
