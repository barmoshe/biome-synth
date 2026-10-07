import type { Role } from "../shared/biomes";
import type { Strip } from "./strip";

/** Width of one biome on the near layer, in art pixels. */
export const BW = 960;
/** Critter x positions are authored on a 768-wide biome and spread to BW. */
export const AUTHOR_W = 768;
export const NB = 5;
export const WORLD = BW * NB;
/** Half-width of the dithered border between biomes, near layer. */
export const BLEND = 150;
/** Height of the painted stage; taller screens get more sky above it. */
export const STAGE = 180;
export const GROUND = 152;

/** Parallax factors: far, mid, near. */
export const LAYER_F = [0.45, 0.7, 1] as const;

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
  /** x within the biome (0..BW) and y on the stage, top-left of the hit box. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Draw at screen art coords (sx, sy) = the hit box's top-left. */
  draw(f: Strip, sx: number, sy: number, a: Anim): void;
};

export type BiomeArt = {
  /** Paint the sky for a screen of w x h (stage at the bottom 180 rows). */
  sky(s: Strip, w: number, h: number): void;
  far(c: PaintCtx): void;
  mid(c: PaintCtx): void;
  near(c: PaintCtx): void;
  critters: CritterSpec[];
  /** Particles drifting over this biome: snow, bubbles, fireflies, rain, stardust. */
  weather?: { kind: "snow" | "bubbles" | "fireflies" | "rain" | "dust"; rate: number };
};
