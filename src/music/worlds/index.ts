// The worlds in travel order, matching BIOMES: space, tundra, sea, jungle, neon.
import type { WorldMusic } from "../world";
import { orbit } from "./orbit";
import { aurora } from "./aurora";
import { deep } from "./deep";
import { songWorld } from "../song";
import { parrotTalk } from "../songs/canopy";
import { neon } from "./neon";

export const makeWorlds = (): WorldMusic[] => [orbit(), aurora(), deep(), songWorld(parrotTalk), neon()];
