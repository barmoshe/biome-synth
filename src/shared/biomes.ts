// The five biomes as shared names: the world side lives in src/world/biomes, the music side in
// src/music/worlds; this file is what both (and the worker) agree on.

export const ROLES = ["bass", "pad", "arp", "lead", "kick", "hat", "perc"] as const;
export type Role = (typeof ROLES)[number];

export type BiomeId = "space" | "tundra" | "sea" | "jungle" | "neon";

export type Biome = {
  id: BiomeId;
  name: string;
  mood: string;
  /** One line describing the world's sound. */
  prompt: string;
};

export const BIOMES: Biome[] = [
  { id: "space", name: "Orbit", mood: "weightless, glittering, mechanical wonder", prompt: "kosmische sequencer music, Berlin school arpeggio, analog pulse ostinato, deep sub drone, no drums, vast reverb" },
  { id: "tundra", name: "Aurora", mood: "still, vast, glassy, patient", prompt: "arctic ambient, tintinnabuli bells, Arvo Part style, slow drones, icy wind, sparse and free time" },
  { id: "sea", name: "Deep", mood: "submerged, hypnotic, dubbed", prompt: "dub techno, muffled kick, chord stabs in tape delay, deep sub bass, hiss, underwater" },
  { id: "jungle", name: "Canopy", mood: "warm, interlocking, alive", prompt: "12/8 afrobeat highlife groove, bell pattern, log drums, kalimba and guitar plucks, polyrhythm" },
  { id: "neon", name: "Neon", mood: "rainy, syncopated, nocturnal", prompt: "UK garage 2-step, Burial style, swung hats, rain and vinyl crackle, Vangelis brass pads, sidechain" },
];

export const BIOME_INDEX: Record<BiomeId, number> = { space: 0, tundra: 1, sea: 2, jungle: 3, neon: 4 };
