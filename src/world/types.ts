import type { Role } from "../shared/biomes";
import type { Strip } from "./strip";

/** Width of one biome on the near layer, in art pixels. */
export const BW = 1200;
/** Critter x positions are authored on this width and spread to BW. */
export const AUTHOR_W = 1200;
export const NB = 5;
export const WORLD = BW * NB;
/** Half-width of the dithered border between biomes, near layer. */
export const BLEND = 180;
/** Height of the painted stage; taller screens get more sky above it, shorter ones lose sky. */
export const STAGE = 270;
export const GROUND = 228;

/** Parallax factors: far, mid, near, foreground. */
export const LAYER_F = [0.45, 0.7, 1, 1.3] as const;
/** How far each layer is pulled toward the biome's air colour (atmospheric perspective). */
export const LAYER_FOG = [0.4, 0.12, 0, 0] as const;
/** Extra fog pooled toward the bottom of each layer. */
export const LAYER_POOL = [0.26, 0.16, 0, 0] as const;

export type PaintCtx = {
  s: Strip;
  /** The biome's core span in this layer's coordinates (paint a little past both ends). */
  x0: number;
  x1: number;
  f: number;
};

export type Anim = {
  /** Seconds since start. */
  t: number;
  /** 0..1, jumps to 1 when the critter plays and decays. */
  act: number;
  /** 0..1 within the current beat. */
  beat: number;
  /** Output loudness 0..1. */
  level: number;
};

export type CritterSpec = {
  name: string;
  role: Role;
  /** x within the biome (0..AUTHOR_W) and y on the stage, top-left of the hit box. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Draw at (sx, sy) = the hit box's top-left. */
  draw(f: Strip, sx: number, sy: number, a: Anim): void;
  /** A soft light this critter always gives off (fireflies, jellyfish, signs): radius in px. */
  glow?: number;
  /** Skip the outline (things made of light, wisps). */
  noOutline?: boolean;
};

/** What a biome's living scenery gets each frame. Screen coordinates; `oy` is the stage's top row. */
export type LiveCtx = { t: number; W: number; H: number; oy: number; camX: number; level: number };

export type BiomeArt = {
  /** Paint the sky for a screen of w x h (stage at the bottom STAGE rows). */
  sky(s: Strip, w: number, h: number): void;
  far(c: PaintCtx): void;
  mid(c: PaintCtx): void;
  near(c: PaintCtx): void;
  /** Dark foreground silhouettes passing in front of everything. */
  front?(c: PaintCtx): void;
  critters: CritterSpec[];
  /** The colour of the air: distant layers fade toward it. */
  air: number;
  /** Unit vector toward the main light (sun, moon, surface), for rim light. */
  toLight: [number, number];
  /**
   * Living scenery: things that move through the biome but are not instruments (birds, cars, fish).
   * Pure functions of time and camera, drawn behind the creatures.
   */
  live?(f: Strip, c: LiveCtx): void;
  /** Particles drifting over this biome: snow, bubbles, fireflies, rain, stardust. */
  weather?: { kind: "snow" | "bubbles" | "fireflies" | "rain" | "dust"; rate: number };
};
