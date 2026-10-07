# Sound and music redesign (2026-10-07)

Bar: the sound is cheap and bad; redesign the whole sound and music system. Survey answers: it is
cheap/toy, thin, harsh/messy and boring; the direction is a **hybrid** (sampled instruments plus
synthesis); the music should be **written songs, one per world**; "be creative".
Baseline numbers: `sound-baseline.md`. Research: three tracks (sample libraries and browser
practice, adaptive game music and songwriting, the workshop's own knowledge), sources inline.

## 1. The idea in one paragraph

Each world gets a written song, a small graph of loopable segments (intro, A, B, chorus, bridge,
outro) where every creature owns a written part (a stem). The band plays the song; the player
conducts and solos inside it. A tap plays a note that lands on the grid and on the chord, wakes that
creature's part for a few bars, and at a phrase end can push the song forward. Choruses leave written
gaps for the player to answer, and the parrot-style answer comes back if they do not. The five songs
share one leitmotif, **the Call**, made of the five worlds' tonics in travel order: **D B E A F#**
(down a minor third, up a fourth, up a fourth, down a minor third, pentatonic and singable). Every
world sings it in its own style, leaning on the note that names it. The instruments are real sampled
instruments (CC0) next to better synthesis, through a mix chain built from the workshop's mixing rules.

## 2. Why it sounded bad, and the fix for each

| Complaint | Cause (measured or read in the code) | Fix |
|---|---|---|
| Cheap / toy | Chip waveforms carry everything; broadband noise beds (Neon air +19 dB) | Sampled instruments for anything acoustic; band-limited synths with filters and saturation for the rest; noise beds cut to a texture under -30 dB with a 9 kHz low-pass |
| Thin | No body at 100-500 Hz (Orbit's 100-130 Hz hole of -20 to -25 dB); a lone sine sub | Bass that has harmonics (contrabass, sub + 2nd/3rd harmonic), cello/piano/guitar in the low mids, kick tuned to the key |
| Harsh / messy | Pulse and saw tops at 2-5 kHz (Canopy +5), noise hats, DC offset 0.10-0.12 in Orbit and Aurora, nothing carving space | DC blocker per voice, high-pass everything but bass and kick at 120-180 Hz, frequency slots per stem, reverb returns high-passed at 250 Hz, sidechain the bass 8 dB under the kick |
| Narrow | Stereo correlation 0.94-0.997 | Stereo samples for keys and ambience, panned stems (a stage layout per song), wide reverbs, lows mono under 120 Hz |
| Boring | Sections differ by density, not by material; no hook; 1-2 chords | Written songs with hooks, real progressions, a chorus, variants per segment (never the same twice running), a bridge reset, and the Call |

## 3. The tempo lattice: crossings without tempo jumps

Four worlds share a 2.0 s bar, so their bar lines line up at a crossing and only the subdivision
changes (a metric modulation). Neon is faster and is entered and left through beatless glides.

| World | Song | Tempo, meter | Key | Feel |
|---|---|---|---|---|
| Orbit | Apogee | 120, 4/4 (half-time) | D Lydian | kosmische lullaby |
| Aurora | Long Night Hymn | 90, 3/4 | B Aeolian | tintinnabuli chorale |
| Deep | Whale Fall Dub | 120, 4/4, swing 54% | E Dorian | melodic dub techno |
| Canopy | Parrot Talk | 12/8, dotted quarter 120 | A major | palm-wine highlife |
| Neon | Last Train Home | 135, 4/4, swing 58% | F# minor | 2-step / future garage |

The keys use two note collections (D major and A major), so a crossing changes at most one pitch (G
to G#). Each outro ends on the next world's home chord: Orbit F#sus4 → Aurora; Aurora Em9 → Deep;
Deep E7 → Canopy; Canopy F#m → Neon; Neon Dmaj7#11 → Orbit.

## 4. The five songs (charts; motifs in the `step:len:degree` grammar)

**Orbit, "Apogee".** Instruments: an analog 16th sequence (synth), sub drone, glockenspiel and harp
(stars), timpani (moon: rolls and swells, never a kick drum), violin section and synth choir (ringed
planet), a sine theremin with portamento (comet and the sky), triangle and shaker (satellite), hand
chimes (beacon), radio bursts and tubular bell (astronaut).
- Intro "Countdown" (4): Dmaj7 pedal, the sequence opens.
- A "Liftoff" (8): Dmaj7 Dmaj7 E/D E/D Dmaj7 Dmaj7 Bm7 E/G#
- B "Weightless" (8): F#m7 ×2, Dmaj9 ×2, Bm9 ×2, E6 ×2
- Chorus "Apogee" (8): Dmaj7 E/D Dmaj7 E/D C#m7 F#m7 Bm7 E7sus4. The Call in bars 1-2, the player's
  answer in 3-4, strings on the Lydian hook in 5-8.
- Bridge "Far Side" (8, no pulse): Gmaj7 ×2, Bbmaj7#11 ×2, Gmaj7 ×2, Asus4 A
- Outro "Re-entry" (4): Dmaj7 Gmaj7 Em7 F#sus4
- The Call: `0:12:0 12:4:-2 16:4:1 20:4:4 24:8:2`. Hook: the 16th ostinato D A E' A F#' A E' A, G#
  every fourth bar.

**Aurora, "Long Night Hymn".** Wine glasses (crystal), tubular bells and hand chimes (ice pillar),
cello section (walrus), ocarina or flute (owl and the sky), bowed cymbal (wind), soft bass drum
(polar bear), woodblock (penguin), felt upright piano, a B drone, shimmer reverb. The tintinnabuli
rule stays: every melody note brings its triad bell.
- Intro "Polar Night" (4): B pedal, Bm(add9) glasses.
- A "Hymn" (8): Bm Bm/A Gmaj7 D/F# Em7 Bm/D Asus2 Bm
- B "Lights" (8): D A/C# Bm7 Gmaj7 D/F# Em9 Gmaj7 F#sus4-F#
- Chorus "The Call" (8): Bm Bm Em7 D/F# Gmaj7 Gmaj7 (answer) Em9 F#sus4
- Bridge "Whiteout" (4-8): beatless E pedal, glass clusters.
- Outro "Thaw" (4): Em9 Em9 A13 Em9
- The Call: `8:4:2 12:12:0 24:4:3 28:4:6 32:16:4`. Hook: the hymn line B C# D C# | B A B.

**Deep, "Whale Fall Dub".** Harmonica (angelfish and the sky: the melodica of dub), vibraphone
(jellyfish), e-piano chord stabs into a 3/16 tape delay (clam), sub plus contrabass (whale), a round
kick (pufferfish), snaps and hats (shrimp), rim and spring crash (coral), an ocean drum bed.
- Intro "Descent" (4): a vibraphone ping into the delay, the kick from bar 3.
- A "Current" (8): Em9 Em9 Em9 A13 ×2, stabs on the offbeats.
- B "Kelp" (8): Gmaj7 F#m7 Em9 A13 Gmaj7 F#m7 Bm9 A13
- Chorus "Whale Call" (8): Em9 ×4 Gmaj7 A13 Em9 Bm7, the bass out under the long E.
- Bridge "Abyss" (8): a dub-out, two bars band, two bars player.
- Outro "Surfacing" (4): Em9 A13 Bm7 E7sus4-E7
- The Call: `10:2:6 14:2:4 16:16:7 34:2:10 38:10:8`. Hook: harmonica B D E answered by E' D' B.

**Canopy, "Parrot Talk".** Two interlocking guitars (Karoryfer, CC0), kalimba (fireflies), balafon,
Ghanaian bobobo drums and log drum (monkey), agogo on the 12/8 bell `x.x.xx.x.x.x` (toucan), shaker
and cabasa (cricket), horns (rafflesia), flute (parrot and the sky), a round bass with slides (frog).
- Intro "Dawn Chorus" (4): bell, kalimba, a guitar lick.
- A "Palm Wine" (8): A D E A A D E7 A
- B "Under Leaves" (8): F#m D A/C# E F#m Bm7 D E7
- Chorus "Parrot Talk" (8): E7-A A D D Bm7 E7 A-F#m Bm7-E7. The flute states the Call, the parrot
  repeats it (or the player's answer), horns take bars 5-8.
- Bridge "Rainstorm" (8): drums and bell, talking-drum calls and player answers.
- Outro "Dusk" (4): D E F#m F#m(add9)
- The Call: `9:1:3 10:1:1 11:1:4 12:6:7 18:6:5`. Hook: two guitars in 3rds and 6ths; the parrot's C# B A.

**Neon, "Last Train Home".** Tenor sax (robot busker and the sky), grand piano in the rain, strings
plus Vangelis brass (neon heart), vocal chops (drone), reese and sub (subway vent), a 2-step kit
(boombox kick, cat hats, trash-can claps and metal), rain as a texture.
- Intro "Platform" (4, beatless, the clock glides 120 → 135): F#m9 Dmaj9 ×2
- A "Night Bus" (8): F#m9 Dmaj9 Bm9 C#7sus4-C#7 ×2
- B "Wet Streets" (8): Bm9 C#m7 Dmaj7 E6 ×2
- Chorus "Last Train" (8): Bm9 F#m9 Dmaj9 E6 Bm9 F#m9 Dmaj9 C#7
- Bridge "Power Cut" (8): rain and piano, a sax answer, a bowed-cymbal rise into chorus 2.
- Outro "Terminus" (4-8): Dmaj7 E6 Dmaj7#11 ×2, slowing to 120 as rain thins into stars.
- The Call: `0:3:5 3:3:3 6:2:6 10:4:9 16:16:7`. Hook: sax A B C# E C# in swung 16ths. Drums follow the
  workshop's garage recipe (`knowledge/27-genre-production.md` §7).

Charts and motifs are proposals: they get written properly, rendered, measured and heard before
they are final.

## 5. Playing inside a song

- **Quantize by action:** hats and percussion to the next 16th, melodic taps to the next 8th (16th
  in Neon), kick-role creatures to the next beat, wakes and stingers to the next bar, form changes to
  the next phrase end. The creature animates at once; the sound lands on the grid. A tap within
  about 40 ms after a grid point plays at once.
- **Chord-aware pitch:** chord tones on strong steps, the chord's own scale on weak ones, never an
  avoid note on a strong step. The sky maps by scale step with hysteresis and resolves to a chord
  tone at a phrase end.
- **Wake a part:** a tap plays one note and wakes that creature's written part for about four bars,
  then it fades. Swells are scheduled so their peak lands on the next downbeat.
- **Answer slots:** marked bars where the band steps back; a written fallback plays if the player is
  silent. The existing listening composer (`mind.ts`) moves here: it captures the player's phrase,
  and the parrot (or each world's echo creature) plays it back, re-harmonized.
- **Move the form:** a kick-role creature tapped in a section's last bar asks for the next segment;
  otherwise the song moves on after its written loop count. Each world remembers where it stopped,
  so the next lap enters at verse 2.
- **Room for the player:** the band's lead drops about 6 dB and the pads cut 1-3 kHz while the
  player solos. More than about four player notes per beat turns into a chord-tone arpeggio.

## 6. Instruments and samples

All CC0 unless marked; each file's source and licence goes in `CREDITS.md`.
- **VCSL** (Versilian, CC0; a browser-ready ogg/m4a mirror at smpldsnds/sgossner-vcsl): kalimba,
  mbira, wine glasses, agogo, balafon, cabasa, claps, claves, hand chimes, glockenspiel, tubular bells,
  vibraphone (struck and bowed), marimba, shakers, slit drum, woodblock, congas, frame drum, ocean
  drum, pianos, harps, ocarina, recorders, harmonica, tenor sax, TX81Z FM.
- **VSCO 2 CE** (CC0): string sections, solo violin, contrabass, harp, flute, horns, trumpet,
  trombone, timpani, log drums, bowed suspended cymbal.
- **Karoryfer** (CC0): Gogodze Phu (Ghanaian bobobo drums), Black And Green Guitars, Shinyguitar,
  basses, The Hat With The Phat, vocal "a" vowel.
- **Sonic Pi samples** (CC0, mirrored at smpldsnds/sonic-pi-samples): electronic kicks, hats,
  `sn_dub`, glass hums, drones, vinyl hiss. Never `loop_amen*`.
- **Avoid:** Philharmonia, 99Sounds, Sonniss, Pixabay, Sonatina, jRhodes3d, MusyngKite/FatBoy,
  Hydrogen kits, any source without a clear licence.
- **Synthesis keeps:** the Orbit sequencer, subs, reese, pads, the theremin, Vangelis brass, vocal
  formants, ambience textures, all rebuilt band-limited with DC blocking, filters and saturation.

**Budget and loading.** Sparse multisamples (every 3 semitones for keys and mallets, 1-2 velocity
layers, 2-4 round robins for hats, shakers and claps), mono except keys and ambience, encoded at
48 kHz as Opus (96k mono) and AAC .m4a (for Safari, chosen by decoding a tiny probe file). About 1-2
MB per world compressed, 7-12 MB in all, under 30 MB decoded per world. At start: a shared core plus
the current world; then the next world on idle; decode one file at a time (iOS crashes on parallel
decodes); free the world behind. A build script trims, normalizes, stores each sample's onset offset
(to cancel codec priming), encodes both formats and writes the manifest and credits.

**Engine.** Samples play inside the existing AudioWorklet: the decoded Float32Arrays move into the
worklet with a transfer list, voices start on their exact frame, and cubic interpolation replaces
the browsers' linear repitching. The sequencer, voices and creature animations keep the current
`Out` shape.

## 7. The mix

Order (workshop `knowledge/24-audio-engineering.md`): gain-stage every stem, static balance, high-pass
everything but bass and kick (120-180 Hz), cut before boost, compression, saturation, sidechain,
reverb and delay on sends, buses, master.
- Buses: drums (4:1, an oversampled clip), bass (high-pass 38 Hz, mono, ducked 8 dB by the kick with
  a release under 0.4 beat), music (keys, pads, mallets: high-pass 150, -3 dB at 300-400 on the busiest
  part), lead (the player and the melody, ducking the music 2-4 dB), ambience.
- Returns: a plate (1.2-2 s, 60-80 ms pre-delay) and a hall (3-6 s) per song, both high-passed at
  250 Hz and low-passed at 10 kHz; the dub delay stays for Deep; a shimmer for Aurora.
- Master: high-pass 25 Hz, low-pass 17.5 kHz, gentle glue (2:1), a 4x oversampled soft clip, a
  true-peak ceiling of -1 dBTP. Each song at -16 to -14 LUFS, choruses 4-6 LU over bridges.
- Tests hold every song to the targets in `sound-baseline.md`, measured with the ears toolkit on the
  offline renders, and Bar's ear on a 30-second preview of the first song before the other four.

## 8. Build order

1. Engine: the sample voice in the worklet, the sample loader and build script, the bus and master
   chain, DC blockers; synth voices rebuilt band-limited.
2. Song player: the song format (segments, variants, stems, chords with per-chord scales, edges,
   stingers, tap rules), the scheduler, chord-aware taps, wakes, answer slots, the Call.
3. **One song end to end (Neon or Canopy) as the vertical slice:** written, rendered, measured, a
   30-second preview to Bar. Adjust from his ear before writing the rest.
4. The other four songs, each rendered and measured.
5. Crossings on the tempo lattice, pivot outros, lap memory.
6. Mobile check (memory, decode, iOS), the README, the step log.
