// Order matches BIOMES in src/shared/biomes.ts: space, tundra, sea, jungle, neon.
import type { BiomeArt } from "../types";
import { space } from "./space";
import { tundra } from "./tundra";
import { sea } from "./sea";
import { jungle } from "./jungle";
import { neon } from "./neon";

export const ART: BiomeArt[] = [space, tundra, sea, jungle, neon];
