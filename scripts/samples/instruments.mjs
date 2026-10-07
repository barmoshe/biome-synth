// What the sample build fetches. Every source is CC0; CREDITS.md is written from this file.
// Pitched instruments pick zones automatically (a note every `every` semitones inside `range`,
// up to `layers` velocity layers and `rr` round robins); hits list their files by key.

export const SOURCES = {
  vcsl: {
    name: "Versilian Community Sample Library (VCSL)",
    author: "Versilian Studios (Sam Gossner)",
    license: "CC0 1.0",
    home: "https://github.com/sgossner/VCSL",
    // The browser mirror: VCSL already encoded as ogg (smpldsnds, used by the smplr package).
    raw: "https://raw.githubusercontent.com/smpldsnds/sgossner-vcsl/main/",
    tree: "https://api.github.com/repos/smpldsnds/sgossner-vcsl/git/trees/main?recursive=1",
  },
  vsco: {
    name: "VSCO 2 Community Edition",
    author: "Versilian Studios (Sam Gossner)",
    license: "CC0 1.0",
    home: "https://github.com/sgossner/VSCO-2-CE",
    raw: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/",
    tree: "https://api.github.com/repos/sgossner/VSCO-2-CE/git/trees/master?recursive=1",
    // VSCO file names put notes an octave low (its "E0" contrabass string is E1).
    octave: 1,
  },
};

/**
 * `key` for hits is a name the music uses ("high", "open"); `vel` orders velocity layers (low to
 * high), and files that share key and vel are round robins.
 */
export const INSTRUMENTS = [
  // ---------- Canopy: palm-wine highlife ----------
  {
    id: "kalimba", world: "jungle", src: "vcsl", pitched: true,
    dir: "Idiophones/Plucked Idiophones/Kalimba, Tanzania", note: /_Main_([A-G]#?\d)_/, range: ["E3", "C#6"], every: 3, rr: 1, maxSec: 2.5,
  },
  {
    id: "guitar", world: "jungle", src: "vcsl", pitched: true, title: "Strumstick (finger)",
    dir: "Chordophones/Composite Chordophones/Strumstick/Finger", note: /_Main_([A-G]#?\d)_/, vel: /_vl(\d)_/, layers: [3], range: ["D2", "G4"], every: 3, rr: 1, maxSec: 2,
  },
  {
    id: "balafon", world: "jungle", src: "vcsl", pitched: true,
    dir: "Idiophones/Struck Idiophones/Balafon/Traditional Mallet", note: /_tradM_([A-G]#?\d)_/, vel: /_vl(\d)_/, layers: [2, 3], range: ["C#3", "F5"], every: 1, rr: 1, maxSec: 1.5,
  },
  {
    id: "recorder", world: "jungle", src: "vcsl", pitched: true, title: "Baroque alto recorder",
    dir: "Aerophones/Edge-blown Aerophones/Baroque Alto Recorder/Sustain", note: /_Sus_([A-G]#?\d)_/, range: ["F3", "E5"], every: 3, rr: 1, maxSec: 1.8,
  },
  {
    id: "trumpet", world: "jungle", src: "vsco", pitched: true, title: "Trumpet (staccato)",
    dir: "Brass/Trumpet/stac", note: /_stac_([A-G]#?\d)_/, vel: /_v(\d)_/, layers: [2, 3], range: ["F2", "C6"], every: 3, rr: 1, maxSec: 1.2,
  },
  {
    id: "trombone", world: "jungle", src: "vsco", pitched: true, title: "Tenor trombone (staccato)",
    dir: "Brass/Tenor Trombone/stac", note: /_stac_([A-G]#?\d)_/, vel: /_v(\d)_/, layers: [2, 4], range: ["A#0", "F4"], every: 3, rr: 1, maxSec: 1.2,
  },
  {
    id: "bass", world: "jungle", src: "vsco", pitched: true, title: "Solo contrabass (pizzicato)",
    dir: "Strings/Solo Contrabass/Pizz", note: /_Pizz_([A-G]#?\d)_/, vel: /_v(\d)_/, layers: [1], range: ["E0", "G#2"], every: 2, rr: 1, maxSec: 1.5,
  },
  {
    id: "agogo", world: "jungle", src: "vcsl", dir: "Idiophones/Struck Idiophones/Agogo Bells",
    hits: [
      { key: "high", vel: 1, file: "Agogo_High_v2_rr1_Mid.ogg" },
      { key: "high", vel: 2, file: "Agogo_High_v3_rr1_Mid.ogg" },
      { key: "low", vel: 1, file: "Agogo_Low_v1_rr1_Mid.ogg" },
      { key: "low", vel: 2, file: "Agogo_Low_v2_rr1_Mid.ogg" },
    ],
  },
  {
    id: "shaker", world: "jungle", src: "vcsl", dir: "Idiophones/Struck Idiophones/Shaker, Small",
    hits: [
      { key: "down", file: "Mid_ShakerDouble_Down_rr1.ogg" },
      { key: "down", file: "Mid_ShakerDouble_Down_rr2.ogg" },
      { key: "up", file: "Mid_ShakerDouble_Up_rr1.ogg" },
      { key: "up", file: "Mid_ShakerDouble_Up_rr2.ogg" },
      { key: "slap", file: "Mid_Shaker_Slap_rr1.ogg" },
      { key: "slap", file: "Mid_Shaker_Slap_rr2.ogg" },
    ],
  },
  {
    id: "cabasa", world: "jungle", src: "vcsl", dir: "Idiophones/Struck Idiophones/Cabasa",
    hits: [
      { key: "hit", file: "Cabasa1_Hit_rr1_Mid.ogg" },
      { key: "hit", file: "Cabasa1_Hit_rr2_Mid.ogg" },
      { key: "rub", file: "Cabasa1_Rub_v2_rr1_Mid.ogg" },
      { key: "rub", file: "Cabasa1_Rub_v2_rr2_Mid.ogg" },
    ],
  },
  {
    id: "conga", world: "jungle", src: "vcsl", dir: "Membranophones/Struck Membranophones/Conga",
    hits: [
      { key: "high", vel: 1, file: "Quinto_HitN_v2_rr1_Sum.ogg" },
      { key: "high", vel: 1, file: "Quinto_HitN_v2_rr2_Sum.ogg" },
      { key: "high", vel: 2, file: "Quinto_HitN_v3_rr1_Sum.ogg" },
      { key: "mid", vel: 1, file: "Conga_HitN_v2_rr1_Sum.ogg" },
      { key: "mid", vel: 1, file: "Conga_HitN_v2_rr2_Sum.ogg" },
      { key: "mid", vel: 2, file: "Conga_HitN_v3_rr1_Sum.ogg" },
      { key: "mid", vel: 2, file: "Conga_HitN_v3_rr2_Sum.ogg" },
      { key: "mute", file: "Conga_HitFM_v2_rr1_Sum.ogg" },
      { key: "mute", file: "Conga_HitFM_v2_rr2_Sum.ogg" },
      { key: "low", vel: 1, file: "Tumba_HitN_v3_rr1_Sum.ogg" },
      { key: "low", vel: 1, file: "Tumba_HitN_v3_rr2_Sum.ogg" },
      { key: "low", vel: 2, file: "Tumba_HitN_v4_rr1_Sum.ogg" },
    ],
  },
  {
    id: "logdrum", world: "jungle", src: "vcsl", dir: "Idiophones/Struck Idiophones/Slit Drum",
    hits: [
      { key: "high", vel: 1, file: "LogDrumHi_MedM_v2_rr1_Sum.ogg" },
      { key: "high", vel: 2, file: "LogDrumHi_MedM_v3_rr1_Sum.ogg" },
      { key: "low", vel: 1, file: "LogDrumLo_MedM_v2_rr1_Sum.ogg" },
      { key: "low", vel: 2, file: "LogDrumLo_MedM_v3_rr1_Sum.ogg" },
    ],
  },
  {
    id: "framedrum", world: "jungle", src: "vcsl", dir: "Membranophones/Struck Membranophones/Frame Drum",
    hits: [
      { key: "low", file: "HDrumL_Hit_v3_rr1_Sum.ogg" },
      { key: "low", file: "HDrumL_Hit_v3_rr2_Sum.ogg" },
      { key: "mute", file: "HDrumL_HitMuted_v3_rr1_Sum.ogg" },
      { key: "mute", file: "HDrumL_HitMuted_v3_rr2_Sum.ogg" },
    ],
  },
  {
    id: "claves", world: "jungle", src: "vcsl", dir: "Idiophones/Struck Idiophones/Claves",
    hits: [
      { key: "hit", vel: 1, file: "Claves1_Hit_v2_rr1_Mid.ogg" },
      { key: "hit", vel: 2, file: "Claves1_Hit_v3_rr1_Mid.ogg" },
    ],
  },
];
