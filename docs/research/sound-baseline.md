# Sound baseline before the redesign (2026-10-07)

Bar: "the sound is cheap and bad". In the survey: cheap/toy, thin/weak, harsh/messy, boring/repetitive.
Measured with the workshop's ears toolkit (`measure --profile streaming`) on the offline renders
(`SNAP=render npx vitest run`, 24 s per world, 44.1 kHz).

| World | LUFS | True peak | Crest | Stereo corr | DC | Balance flags (dB vs target tilt) |
|---|---|---|---|---|---|---|
| Orbit | -21.7 | -5.3 | 10.7 | 0.943 | **0.119** | sub 20-40 +9.9, punch 100-200 -6.6, a 100-130 Hz hole of -20 to -25 |
| Aurora | -19.0 | -5.4 | 11.9 | 0.939 | **0.097** | air +4.7 |
| Deep | -17.3 | -2.9 | 16.3 | 0.944 | 0.001 | close to balanced, quiet |
| Canopy | -16.7 | -2.8 | 16.2 | **0.997** | 0.001 | harsh 2-5k +5.1, sibilance +4.5, punch -8.1 |
| Neon | -16.6 | -2.6 | 14.8 | 0.990 | 0.010 | sibilance +10.8, air +19.3 (a broadband noise floor), mud -6 |

What the numbers say about the complaints:

- **Cheap/harsh:** broadband noise (bed crackle, noise voices) fills the top octaves, worst in Neon.
  Chip waveforms (pulse, stepped triangle) add harsh upper partials with no real body under them.
- **Thin:** the 100-500 Hz body is missing (Orbit's hole at 100-130 Hz, Canopy and Neon low in punch
  and mid), while a sine sub sits alone under 50 Hz.
- **Messy:** DC offset of 0.10-0.12 in Orbit and Aurora (a voice or the bed is not centred); every
  world is under the streaming window, so the limiter is not the problem.
- **Narrow:** correlation 0.94-0.997: nearly mono. Nothing has real stereo width or depth.
- **Boring:** short-term loudness is flat inside each render; the arc is a filter, not an arrangement.

Targets for the redesign: -16 to -14 LUFS per world (a game, quieter than a release), true peak
under -1 dBTP, DC under 0.005, balance within about ±4 dB of the tilt in every band, correlation
0.6-0.85 with mono lows (side under 120 Hz at -20 dB or lower), a real short-term arc per song.
