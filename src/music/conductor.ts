// The conductor: which section is playing, what comes next, and the player's place in it.
// Claude (when awake) writes the next section while the current one plays; the swap happens on
// the section boundary, and if Claude is late or wrong the local band's section plays instead.
// Claude is never in the timing loop.
import type { BiomeId } from "../shared/biomes";
import { Responder, motif, NEXT, perform, rng, writeSection, type Hit } from "./band";
import { clampSection, type Section, type SectionName } from "./pattern";

export type ComposeRequest = {
  name: SectionName;
  biome: BiomeId;
  /** Biomes blended under the camera, strongest first. */
  blend: { biome: BiomeId; weight: number }[];
  previous: Section;
  /** What the player did recently, in words and numbers. */
  player: { notes: number; taps: Partial<Record<string, number>>; phrase: number[] };
};
export type Composer = (req: ComposeRequest) => Promise<unknown>;

export type ConductorDeps = {
  seed: number;
  dominant(): BiomeId;
  blend(): { biome: BiomeId; weight: number }[];
  composer?: Composer | null;
  onSection?(s: Section, step: number): void;
};

export class Conductor {
  section: Section;
  start = 0;
  private next: Section | null = null;
  private asking = false;
  private theme;
  private responder = new Responder();
  private answers = new Map<number, Hit[]>();
  private taps: Record<string, number> = {};
  private playerNotes = 0;
  private recentPhrase: number[] = [];
  /** Extra drum hits the player wrote this section, by role, per 16th. */
  extra: Partial<Record<"kick" | "hat" | "perc", number[]>> = {};
  private r;

  constructor(private deps: ConductorDeps) {
    this.r = rng(deps.seed, "conductor");
    this.theme = motif(rng(deps.seed, "theme"));
    this.section = writeSection("drift", deps.dominant(), deps.seed, this.theme);
  }

  setComposer(c: Composer | null) {
    this.deps.composer = c;
    if (!c) this.next = null;
  }

  /** Called by the clock for every global step. Returns everything to play on it. */
  hits(step: number): Hit[] {
    if (step >= this.start + this.section.bars * 16) this.advance(step);
    if (step === this.start) this.prepareNext();

    const s = step - this.start;
    const out = perform(this.section, s, { muteLead: this.responder.soloing(step), extra: this.extra, random: this.r });

    const ans = this.responder.answer(step, this.r);
    if (ans) for (const a of ans) this.queue(step + a.offset, { role: "lead", deg: a.deg, vel: 0.6, len: 2, from: "echo" });
    const due = this.answers.get(step);
    if (due) {
      out.push(...due);
      this.answers.delete(step);
    }
    return out;
  }

  private queue(step: number, h: Hit) {
    const list = this.answers.get(step) ?? [];
    list.push(h);
    this.answers.set(step, list);
  }

  private advance(step: number) {
    const name = NEXT[this.section.name];
    const fresh = this.next ?? writeSection(name, this.deps.dominant(), this.deps.seed + step, this.theme);
    this.next = null;
    this.section = fresh;
    this.start = step;
    this.extra = {};
    this.taps = {};
    this.playerNotes = 0;
    this.deps.onSection?.(fresh, step);
  }

  /** Ask Claude for the section after this one, while this one plays. */
  private prepareNext() {
    const c = this.deps.composer;
    if (!c || this.asking) return;
    this.asking = true;
    const name = NEXT[this.section.name];
    const req: ComposeRequest = {
      name,
      biome: this.deps.dominant(),
      blend: this.deps.blend(),
      previous: this.section,
      player: { notes: this.playerNotes, taps: { ...this.taps }, phrase: this.recentPhrase.slice(-12) },
    };
    const forSection = this.section;
    c(req)
      .then((raw) => {
        // Only keep it if we are still in the section it was written to follow.
        if (raw && this.section === forSection && this.deps.composer === c) this.next = { ...clampSection(raw, name), by: "claude" };
      })
      .catch(() => {})
      .finally(() => {
        this.asking = false;
      });
  }

  /** The player tapped open sky: a lead note at absolute degree `deg`. */
  playerLead(step: number, deg: number, echo = true) {
    this.responder.notePlayed(step, deg);
    this.recentPhrase.push(deg);
    if (this.recentPhrase.length > 24) this.recentPhrase.shift();
    this.playerNotes++;
    this.taps.lead = (this.taps.lead ?? 0) + 1;
    // A soft echo a dotted eighth later, a third up: the world sings back.
    if (echo) this.queue(step + 3, { role: "arp", deg: deg + 2, vel: 0.3, len: 2, from: "echo" });
  }

  /** The player tapped a critter. Returns the note it should play now, in harmony. */
  playerRole(step: number, role: Hit["role"]): Hit[] {
    this.taps[role] = (this.taps[role] ?? 0) + 1;
    this.playerNotes++;
    const s = Math.max(0, step - this.start);
    const chord = this.section.chords[Math.floor(s / 16) % this.section.chords.length];
    const n = this.taps[role];
    if (role === "kick" || role === "hat" || role === "perc") {
      // Tapped drums also join the groove for the rest of the section.
      const arr = (this.extra[role] ??= new Array(16).fill(0));
      arr[step % 16] = 0.8;
      return [{ role, vel: 0.9, len: 1, from: "player" }];
    }
    if (role === "pad") return [0, 2, 4].map((d) => ({ role, deg: chord + d, vel: 0.7, len: 16, from: "player" as const }));
    if (role === "bass") return [{ role, deg: chord + [0, 4, 0, 2][n % 4], vel: 0.9, len: 4, from: "player" }];
    if (role === "arp") return [{ role, deg: chord + [0, 2, 4, 7][n % 4], vel: 0.7, len: 2, from: "player" }];
    // A lead critter sings the next note of the theme.
    const t = this.theme[n % this.theme.length];
    this.responder.notePlayed(step, chord + t.deg);
    return [{ role, deg: chord + t.deg, vel: 0.8, len: Math.min(4, t.len), from: "player" }];
  }
}
