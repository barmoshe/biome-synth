// The worlds in travel order, matching BIOMES: space, tundra, sea, jungle, neon.
import type { WorldMusic } from "../world";
import { orbit } from "./orbit";
import { aurora } from "./aurora";
import { deep } from "./deep";
import { canopy } from "./canopy";
import { neon } from "./neon";

export const makeWorlds = (): WorldMusic[] => [orbit(), aurora(), deep(), canopy(), neon()];
