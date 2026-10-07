// Canopy: "Parrot Talk", palm-wine highlife at dusk. 12/8, a dotted quarter at 120 (a 2-second bar,
// the tempo lattice shared with Orbit, Aurora and Deep), A major.
// The band: two strumstick guitars in the palm-wine style (a thumb on the beat, fingers off it, and
// a second guitar hooking in thirds), pizzicato contrabass walking the changes, kalimba in three
// against two, the 12/8 bell on agogo, shaker and cabasa, congas, frame drum and log drum, and a
// trumpet-and-trombone section. The recorder carries the melody and the Call (D B E A F#, the five
// worlds' tonics); the parrot is a trumpet that plays the player's phrases back, reharmonised.
// Form: Dawn Chorus → Palm Wine ×2 → Under Leaves → Parrot Talk → Rainstorm → Parrot Talk → Palm Wine…
// with answer bars left for the player, and Dusk on the way out (it ends on F#m, Neon's home chord).
import { BUS } from "../../audio/dsp/mix";
import { lane, line, snapPc, voicing, nearest, pc, type BarCtx, type Ev, type Part, type Song } from "../song";
import type { Chord } from "../chords";

const A = 57; // A3
const SCALE = [0, 2, 4, 5, 7, 9, 11];
const PENT = [0, 1, 2, 4, 5];
const inScale = (m: number) => snapPc(m, SCALE.map((x) => pc(A + x)));
/** The Call in Canopy: D B E as eighth-note pickups, A held over the downbeat, then F#. */
const CALL = [62, 59, 64, 69, 66];

const hits = (pat: string, inst: string, key: string | ((at: number) => string), vel: number, extra: Partial<Ev> = {}): Ev[] =>
  lane(pat).map((h) => ({ at: h.at, inst, key: typeof key === "string" ? key : key(h.at), vel: h.vel * vel, ...extra }));
const notes = (src: string, inst: string, vel: number, extra: Partial<Ev> = {}): Ev[] => line(src).map((n) => ({ at: n.at, inst, midi: n.midi, len: n.len, vel, ...extra }));
const tone = (ch: Chord, i: number, near: number) => nearest(ch.tones[i % ch.tones.length], near);

// ---------- percussion ----------

const bell: Part = {
  id: "bell", role: "perc", send: 0.12, loose: 0.003,
  // The standard 12/8 bell; the low bell marks the one and the seventh step in the chorus.
  bar: (c) => hits("X.x.xx.x.x.x", "agogo", (at) => (c.seg.id === "chorus" && (at === 0 || at === 7) ? "low" : "high"), c.seg.id === "chorus" ? 0.46 : 0.38, { pan: 0.55 }),
};

const shaker: Part = {
  id: "shaker", role: "hat", send: 0.08, feel: 0.012, loose: 0.006,
  bar: (c) => hits("xoxxoxxoxxox", "shaker", (at) => (at % 3 === 0 ? "down" : "up"), c.seg.id === "chorus" ? 0.3 : 0.24, { pan: -0.6 }),
};

const cabasa: Part = {
  id: "cabasa", role: "hat", send: 0.1, feel: 0.008,
  bar: (c) => hits(c.bar % 2 ? "...x.....x.x" : "...x.....x..", "cabasa", (at) => (at === 11 ? "hit" : "rub"), 0.32, { pan: -0.4, silent: true }),
};

const kick: Part = {
  id: "kick", role: "kick", send: 0.06,
  bar: (c) => {
    if (c.seg.id === "intro" && c.bar < 2) return [];
    // One and three of the dotted-quarter pulse; a pickup into the next bar in the chorus and at phrase ends.
    const pat = c.seg.id === "chorus" || c.bar % 4 === 3 ? "X.....x....o" : "X.....x.....";
    // A frame drum for the skin, and a low synth thump under it for the body the recording lacks.
    return hits(pat, "framedrum", "low", 0.95).flatMap((e) => [e, { ...e, inst: "", synth: { patch: "tom", freq: 50, f2: 78, sweep: 0.05, vel: 0.55, dur: 0.01, release: 0.32, bright: 0.1 } }]);
  },
};

const logdrum: Part = {
  id: "logdrum", role: "kick", send: 0.18, loose: 0.004,
  bar: (c) => hits(c.bar % 4 === 3 ? "...x..x..xxx" : "...x.....x.x", "logdrum", (at) => (at === 9 || at === 10 ? "low" : "high"), 0.55, { pan: 0.15, silent: true }),
};

const congas: Part = {
  id: "congas", role: "perc", send: 0.12, loose: 0.005,
  bar: (c) => {
    const k: [number, string, number][] = [[2, "mute", 0.3], [3, "mid", 0.7], [5, "mute", 0.28], [8, "mute", 0.3], [9, "mid", 0.72], [10, "high", 0.45], [11, "low", 0.55]];
    if (c.pass % 2) k.push([6, "low", 0.5]);
    return k.map(([at, key, vel]) => ({ at, inst: "conga", key, vel, pan: -0.35, silent: true }));
  },
};

/** The bridge's talking drum: log drum hits that bend up, a call every other bar. */
const talk: Part = {
  id: "talk", role: "kick", send: 0.2,
  bar: (c) => {
    if (c.bar % 2) return [];
    const calls = ["X.x..x.xx...", "X..x.x..xx.x", "x.xx..X.x...", "X.x.x..x.X.."];
    return lane(calls[(c.bar / 2) % calls.length]).map((h, i) => ({ at: h.at, inst: "logdrum", key: i % 2 ? "high" : "low", vel: h.vel * 0.75, bend: 2, sweep: 0.12, pan: 0.2 }));
  },
};

// ---------- bass and guitars ----------

/** A sine under each bass note: the pizzicato's fundamental is weak, the sub gives it weight. */
const withSub = (evs: Ev[]): Ev[] =>
  evs.flatMap((e) => [e, { ...e, inst: "", synth: { patch: "sub", freq: 440 * Math.pow(2, ((e.midi ?? 45) - 69) / 12), vel: 0.3, dur: Math.max(0.15, (e.len ?? 2) * 0.15), attack: 0.008, release: 0.18, bright: 0.1 }, silent: true }]);

const bass: Part = {
  id: "bass", role: "bass", send: 0.05,
  bar: (c) => {
    if (c.seg.id === "intro" && c.bar < 2) return [];
    const evs: Ev[] = [];
    const lo = (p: number) => nearest(p, 41);
    if (c.chords.length > 1) {
      for (const [i, ch] of c.chords.entries()) {
        evs.push({ at: i * 6, inst: "bass", midi: lo(ch.bass), len: 3, vel: 0.9 });
        evs.push({ at: i * 6 + 3, inst: "bass", midi: lo(ch.tones[2]), len: 2, vel: 0.65 });
      }
      return withSub(evs);
    }
    const ch = c.chords[0];
    const root = lo(ch.bass);
    const fifth = nearest(ch.tones[2], root + 5);
    // Root, fifth, the third above, the fifth again, then a step into the next chord.
    evs.push({ at: 0, inst: "bass", midi: root, len: 4, vel: 0.95 });
    evs.push({ at: 4, inst: "bass", midi: fifth, len: 2, vel: 0.62 });
    evs.push({ at: 6, inst: "bass", midi: nearest(ch.tones[1], root + 9), len: 2, vel: 0.75 });
    evs.push({ at: 9, inst: "bass", midi: fifth, len: 2, vel: 0.6 });
    const target = lo(c.next.bass);
    if (target !== root) evs.push({ at: 11, inst: "bass", midi: inScale(target + (target > root ? -1 : 1)), len: 1, vel: 0.55 });
    return withSub(evs);
  },
};

/** Guitar one: a thumb on the beats (root, fifth), fingers on the last eighth of each beat. */
const guitar1: Part = {
  id: "guitar1", role: "pad", send: 0.18, loose: 0.006,
  bar: (c) => {
    const evs: Ev[] = [];
    for (let beat = 0; beat < 4; beat++) {
      const at = beat * 3;
      const ch = c.chordAt(at);
      const thumb = beat % 2 ? nearest(ch.tones[2], 50) : nearest(ch.bass, 47);
      evs.push({ at, inst: "guitar", midi: thumb, vel: 0.72, pan: -0.45, silent: true });
      const top = voicing(ch, 59, 3);
      evs.push({ at: at + 2, inst: "guitar", midi: top[1], vel: 0.55, pan: -0.55, silent: true });
      evs.push({ at: at + 2.06, inst: "guitar", midi: top[2], vel: 0.5, pan: -0.55, silent: true });
    }
    return evs;
  },
};

/** Guitar two: the hook, thirds on the second eighth of each beat, climbing and falling back. */
const guitar2: Part = {
  id: "guitar2", role: "pad", send: 0.2, delay: 0.08, loose: 0.006,
  bar: (c) => {
    if (c.seg.id === "verse" && c.pass === 0) return [];
    const evs: Ev[] = [];
    const shape = [2, 3, 4, 3];
    for (let beat = 0; beat < 4; beat++) {
      const at = beat * 3 + 1;
      const ch = c.chordAt(at);
      const tones = voicing(ch, 64, 5);
      const top = tones[Math.min(tones.length - 1, shape[beat])];
      const under = inScale(top - 4);
      evs.push({ at, inst: "guitar", midi: top, vel: 0.52, pan: 0.55, silent: true });
      evs.push({ at: at + 0.04, inst: "guitar", midi: under, vel: 0.42, pan: 0.5, silent: true });
    }
    return evs;
  },
};

// ---------- mallets ----------

/** Fireflies: kalimba in three against the 12/8 two, chord tones climbing. */
const kalimba: Part = {
  id: "kalimba", role: "arp", send: 0.3, delay: 0.12, loose: 0.004,
  bar: (c) => {
    const evs: Ev[] = [];
    const sparse = c.seg.id === "chorus" || c.seg.id === "under";
    for (let i = 0; i < 6; i++) {
      if (sparse && i % 2) continue;
      const at = i * 2;
      const ch = c.chordAt(at);
      const t = voicing(ch, 69, 4);
      evs.push({ at, inst: "kalimba", midi: t[(i + c.bar) % t.length], vel: i === 0 ? 0.6 : 0.45, pan: 0.4 * ((i % 3) - 1) });
    }
    return evs;
  },
};

/** Balafon cascades in Under Leaves: chord tones tumbling down, twice a bar. */
const balafon: Part = {
  id: "balafon", role: "arp", send: 0.22, loose: 0.004,
  bar: (c) => {
    const evs: Ev[] = [];
    for (const start of [0, 6]) {
      const ch = c.chordAt(start);
      const t = voicing(ch, 64, 4).reverse();
      t.slice(0, 3).forEach((m, i) => evs.push({ at: start + i, inst: "balafon", midi: m + (start ? 0 : 12) * (c.bar % 2), vel: 0.55 - i * 0.08, pan: 0.35 - i * 0.2, silent: true }));
    }
    return evs;
  },
};

// ---------- horns ----------

const RIFF = [
  "0:74:2 3:73:1 5:71:3 9:69:1 10:71:2",
  "0:68:2 3:71:1 5:74:3 9:76:1 10:74:2",
  "0:73:3 3:76:2 6:73:3 9:69:1 10:71:2",
  "0:74:2 3:73:2 6:71:2 9:68:1 10:71:2",
];

const horns: Part = {
  id: "horns", role: "pad", send: 0.22, delay: 0.06,
  bar: (c) => {
    const evs: Ev[] = [];
    const riff = c.seg.id === "chorus" && c.bar >= 4;
    if (riff) {
      for (const n of line(RIFF[c.bar - 4])) {
        const ch = c.chordAt(n.at);
        evs.push({ at: n.at, inst: "trumpet", midi: n.midi, len: n.len, vel: 0.85, pan: 0.35 });
        evs.push({ at: n.at + 0.03, inst: "trombone", midi: snapPc(n.midi - 8, ch.tones.slice(0, 4)), len: n.len, vel: 0.8, pan: -0.35 });
      }
      return evs;
    }
    // Stabs on the off-beats of every other bar.
    if (c.bar % 2 === 1) {
      for (const at of [3, 9]) {
        const ch = c.chordAt(at);
        for (const m of voicing(ch, 64, 2)) evs.push({ at, inst: "trumpet", midi: m, len: 1, vel: 0.6, pan: 0.2 });
        for (const m of voicing(ch, 52, 2)) evs.push({ at: at + 0.02, inst: "trombone", midi: m, len: 1, vel: 0.55, pan: -0.1 });
      }
    }
    return evs;
  },
};

// ---------- melody, the Call, the parrot ----------

const MELODY: Record<string, string[]> = {
  verse: [
    "0:64:3 3:66:2 5:69:4 9:66:3",
    "0:66:2 2:64:1 3:62:3 6:66:3 9:69:3",
    "", "",
    "0:73:3 3:71:2 5:69:4 9:66:3",
    "0:69:3 3:66:2 5:64:4 9:62:3",
    "0:64:2 2:68:1 3:71:3 6:74:3 9:71:3",
    "0:73:6 6:69:6",
  ],
  chorus: ["9:62:1 10:59:1 11:64:1", "0:69:6 6:66:6", "", "", "", "", "", ""],
  outro: ["0:66:12", "0:68:6 6:71:6", "0:69:12", "0:73:12"],
};

const lead: Part = {
  id: "lead", role: "lead", send: 0.32, delay: 0.1, bus: BUS.lead,
  bar: (c) => {
    const src = MELODY[c.seg.id]?.[c.bar];
    if (!src) return [];
    // Pass the melody around: the second verse goes to the trumpet.
    const inst = c.seg.id === "verse" && c.pass % 2 === 1 ? "trumpet" : "recorder";
    return notes(src, inst, c.seg.id === "chorus" ? 0.82 : inst === "trumpet" ? 0.62 : 0.66, { pan: 0.05 });
  },
};

/** The parrot: plays back the player's last phrase (the mind hands it over), or the Call in an empty answer slot. */
const echo: Part = {
  id: "echo", role: "lead", send: 0.3, delay: 0.15, bus: BUS.lead,
  bar: (c) => {
    if (c.heard && c.heard.length >= 2) {
      const phrase = c.heard;
      c.answered();
      return phrase.slice(0, 8).map((n) => {
        const midi = A + 12 + 12 * Math.floor(n.deg / 7) + SCALE[((n.deg % 7) + 7) % 7];
        const ch = c.chordAt(n.step % 12);
        const m = n.step % 3 === 0 ? snapPc(midi, ch.tones.slice(0, 4)) : midi;
        return { at: n.step, inst: "trumpet", midi: Math.min(76, m), len: Math.max(1, n.len), vel: 0.62, pan: 0.3 };
      });
    }
    if (c.seg.id === "chorus" && (c.bar === 2 || c.bar === 3) && !c.playerActive)
      return notes(c.bar === 2 ? "3:69:1 4:71:1 5:73:2 9:62:1 10:59:1 11:64:1" : "0:69:4 4:68:2 6:66:6", "trumpet", 0.6, { pan: 0.3 });
    return [];
  },
};

export const parrotTalk: Song = {
  id: "jungle",
  title: "Parrot Talk",
  genre: "palm-wine highlife",
  tonic: A,
  scale: SCALE,
  skyDegrees: PENT,
  bpm: 120, // the dotted quarter
  stepsPerBar: 12,
  stepsPerBeat: 3,
  swing: 0.5,
  humanize: 0.004,
  level: 1,
  fx: { room: 0.35, hall: 0.22, delayTime: 1 / 3, feedback: 0.22, delayLp: 4200, delayWet: 0.12, masterLp: 18500, wobble: 0, wobbleHz: 0.3, duck: 0, duckRelease: 0.2, hallSec: 2.2 },
  parts: [bell, shaker, cabasa, kick, logdrum, congas, talk, bass, guitar1, guitar2, kalimba, balafon, horns, lead, echo],
  segments: [
    { id: "intro", title: "Dawn Chorus", hud: "drift", bars: 4, chords: "A | A | D | E", energy: 0.2, gain: 0.9, parts: { bell: 0.8, kalimba: 1, guitar2: 0.8, kick: 0.7, bass: 0.8, shaker: 0.5, echo: 1 }, next: ["verse"] },
    { id: "verse", title: "Palm Wine", hud: "pulse", bars: 8, loops: 2, chords: "A | D | E | A | A | D | E7 | A", energy: 0.45, gain: 0.78, answer: [2, 3],
      parts: { bell: 1, shaker: 1, kick: 1, congas: 0.8, bass: 1, guitar1: 1, guitar2: 1, kalimba: 0.6, lead: 1, echo: 1 }, next: ["under"] },
    { id: "under", title: "Under Leaves", hud: "bloom", bars: 8, chords: "F#m | D | A/C# | E | F#m | Bm7 | D | E7", energy: 0.6, gain: 0.95,
      parts: { bell: 1, shaker: 1, cabasa: 0.7, kick: 1, logdrum: 0.8, congas: 1, bass: 1, guitar1: 1, balafon: 1, kalimba: 0.45, echo: 1 }, next: ["chorus"] },
    { id: "chorus", title: "Parrot Talk", hud: "surge", bars: 8, chords: "E7 | A | D | A | Bm7 | E7 | A F#m | Bm7 E7", energy: 0.9, gain: 1.22, answer: [2, 3],
      parts: { bell: 1, shaker: 1, cabasa: 0.9, kick: 1, logdrum: 0.9, congas: 1, bass: 1, guitar1: 1, guitar2: 1, kalimba: 0.5, balafon: 0.7, horns: 1, lead: 1, echo: 1 }, next: ["rain", "verse"] },
    { id: "rain", title: "Rainstorm", hud: "dissolve", bars: 8, chords: "A | A | D | D | E | E | A | A", energy: 0.35, gain: 0.95, answer: [1, 3, 5, 7],
      parts: { bell: 1, shaker: 0.8, kick: 0.85, talk: 1, congas: 1, bass: 0.8, echo: 1 }, next: ["chorus"] },
    { id: "outro", title: "Dusk", hud: "dissolve", bars: 4, chords: "D | E | F#m | F#m(add9)", energy: 0.25, parts: { guitar1: 0.7, kalimba: 0.8, bass: 0.7, lead: 0.8, bell: 0.4 }, next: ["outro"] },
  ],
  start: "intro",
  outro: "outro",
  taps: {
    // The parrot sings the next note of the Call, onto the chord.
    lead: { q: 1, play: (t) => [{ at: 0, inst: "recorder", midi: t.pos % 3 === 0 ? snapPc(CALL[t.count % 5], t.chord.tones.slice(0, 4)) : CALL[t.count % 5], len: 3, vel: 0.85 }] },
    // Fireflies: kalimba chord tones that climb with every tap.
    arp: { q: 1, wakes: ["kalimba"], play: (t) => [{ at: 0, inst: "kalimba", midi: voicing(t.chord, 69, 8)[t.count % 8], vel: 0.75 }] },
    // The frog: a bass slide up into the root, on the beat.
    bass: { q: 3, wakes: ["bass"], play: (t) => [{ at: 0, inst: "bass", midi: nearest(t.chord.bass, 45) - 2, bend: 2, sweep: 0.1, len: 3, vel: 0.95 }] },
    // The monkey: a log-drum roll into the next beat; in a section's last bar it pushes the song on.
    kick: { q: 3, advances: true, play: () => [{ at: 0, inst: "framedrum", key: "low", vel: 1 }, { at: 0, inst: "logdrum", key: "low", vel: 0.7 }, { at: 1, inst: "logdrum", key: "high", vel: 0.55 }, { at: 2, inst: "logdrum", key: "high", vel: 0.65 }] },
    // The cricket: a shaker slap, and the cabasa joins.
    hat: { q: 1, wakes: ["cabasa"], play: () => [{ at: 0, inst: "shaker", key: "slap", vel: 0.8 }] },
    // The toucan: the bell, high and low in turn, and the congas join.
    perc: { q: 1, wakes: ["congas"], play: (t) => [{ at: 0, inst: "agogo", key: t.count % 2 ? "low" : "high", vel: 0.8 }] },
    // The rafflesia: a horn stab on the beat, and the horns stay for a while.
    pad: { q: 3, wakes: ["horns"], play: (t) => [...voicing(t.chord, 64, 2).map((m) => ({ at: 0, inst: "trumpet", midi: m, len: 1, vel: 0.75 })), ...voicing(t.chord, 52, 2).map((m) => ({ at: 0.02, inst: "trombone", midi: m, len: 1, vel: 0.7 }))] },
  },
  sky: (midi, c) => [{ at: 0, inst: "recorder", midi: Math.max(53, Math.min(79, midi)), len: c.speed > 300 ? 1 : 3, vel: 0.5 + 0.35 * c.bright, pan: c.pan }],
  idiom: ["0:2:4 3:2:5 6:2:4 9:3:2", "0:1:7 2:1:5 4:2:4 7:2:2 9:3:0", "0:3:2 3:3:4 6:3:5 9:3:4 12:6:2", "1:2:5 3:2:4 5:1:2 6:6:0"],
};
