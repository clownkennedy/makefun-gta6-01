// DOCKLINE — Port Meridian. Every tuning number, colour and piece of the
// static city layout in one place. The world is 3200x2400 units; the camera
// follows the player and scales the view to the window.

export const WORLD = { width: 3200, height: 2400 };
export const SEA_X = 2640; // open sea starts here (east edge)
export const TIDAL = { x: 2500, y: 1180, w: 140, h: 440 }; // tidal channel: boats only at high tide
export const TIDE_PERIOD = 60; // seconds per full tide cycle
export const TIDE_HIGH_SECONDS = 40; // first 40s of each cycle the tide is high

export const STEP = 1 / 60;
export const SAVE_KEY = 'dockline.save.v1';

export const ROADS_H = [400, 1000, 1600, 2100];
export const ROADS_V = [400, 1000, 1600, 2200];
export const ROAD_HALF = 46;

export const PLAYER = {
  radius: 14,
  walkSpeed: 230,
  wadeSpeed: 110,
  health: 100,
  shootCooldown: 0.22,
  meleeCooldown: 0.45,
  meleeRange: 64,
  meleeDamage: 40,
};

export const CAR = {
  radius: 24,
  accel: 340,
  maxSpeed: 540,
  reverseMax: 170,
  turnRate: 2.6,
  brake: 700,
};

export const TRUCK = {
  radius: 30,
  accel: 240,
  maxSpeed: 430,
  reverseMax: 140,
  turnRate: 2.0,
};

export const BOAT = {
  radius: 26,
  accel: 400,
  maxSpeed: 640,
  reverseMax: 180,
  turnRate: 2.4,
};

export const BULLET = { playerSpeed: 920, enemySpeed: 520, damage: 34, enemyDamage: 12, range: 720 };

export const WANTED_DECAY_SECONDS = 8; // no police near for this long -> -1 star

// Static solid rectangles: warehouses, shops, market stalls, crane bases.
// {x, y, w, h, color, label}
export const BUILDINGS = [
  { x: 120, y: 120, w: 190, h: 150, color: '#5a4636', label: 'GUDANG 1' },
  { x: 480, y: 500, w: 220, h: 130, color: '#6b4a3a', label: 'GUDANG 2' },
  { x: 480, y: 700, w: 220, h: 130, color: '#54423a', label: 'GUDANG 3' },
  { x: 1080, y: 500, w: 260, h: 140, color: '#5d4a35', label: 'GUDANG BESAR' },
  { x: 1080, y: 700, w: 260, h: 140, color: '#4c3f33', label: 'GUDANG 4' },
  { x: 1080, y: 1100, w: 200, h: 160, color: '#6e5646', label: 'BENGKEL' },
  { x: 480, y: 1100, w: 200, h: 160, color: '#5a4a3c', label: 'KANTOR DOK' },
  { x: 480, y: 1700, w: 240, h: 140, color: '#7a5c40', label: 'PASAR IKAN' },
  { x: 1080, y: 1700, w: 220, h: 140, color: '#63503f', label: 'TOKO UMPAN' },
  { x: 1700, y: 1700, w: 200, h: 140, color: '#6b5138', label: 'WARUNG' },
  { x: 1700, y: 2200, w: 220, h: 120, color: '#54402f', label: 'DEPO' },
  { x: 1080, y: 2200, w: 220, h: 120, color: '#5d4632', label: 'GUDANG 5' },
  { x: 120, y: 1700, w: 200, h: 140, color: '#6a4c38', label: 'KANTOR PELABUHAN' },
  { x: 120, y: 1100, w: 190, h: 150, color: '#57493a', label: 'POS SATPAM' },
  { x: 1700, y: 1100, w: 130, h: 130, color: '#4f4034', label: 'MENARA AIR' },
];

// Container yard (two blocks split by the y=1000 road). Containers are
// generated from these rects in world.js; the gold container sits in the yard.
export const YARDS = [
  { x: 1700, y: 500, w: 760, h: 420 },
  { x: 1700, y: 1080, w: 760, h: 330 },
];
export const GOLD_CONTAINER = { x: 2150, y: 740 };

export const CRANES = [
  { x: 1800, y: 470 },
  { x: 2320, y: 470 },
  { x: 2050, y: 1440 },
];

// Piers jutting into the sea (walkable). The lighthouse stands at the end
// of the north pier; the boss yacht moors beside it.
export const PIERS = [
  { x: 2640, y: 280, w: 300, h: 60 },
  { x: 2640, y: 880, w: 260, h: 60 },
  { x: 2640, y: 1480, w: 300, h: 60 },
];
export const LIGHTHOUSE = { x: 2900, y: 310, radius: 26 };
export const YACHT = { x: 2850, y: 380, w: 120, h: 44 };
export const LEDGER_POINT = { x: 2880, y: 330 };

export const FISH_MARKET = { x: 2260, y: 1720, w: 300, h: 260 };

export const MISSIONS = [
  { name: 'Shift Malam', reward: 800, brief: 'Curi truk kontainer dari lapangan dan antar ke titik drop sebelum patroli datang.' },
  { name: 'Muatan Emas', reward: 1500, brief: 'Rampok gudang yang dijaga. Ambil kontainer bertanda emas, kabur lewat gang gudang.' },
  { name: 'Air Pasang', reward: 1000, brief: 'Kabur dengan speedboat menyusuri dermaga saat air pasang.' },
  { name: 'Pasar Ikan', reward: 1200, brief: 'Lindungi serah-terima di pasar ikan dari serangan geng rival.' },
  { name: 'Konvoi', reward: 2000, brief: 'Sergap konvoi truk yang bergerak. Ram dan curi truk tengah.' },
  { name: 'Kapal Terakhir', reward: 5000, brief: 'Curi buku catatan utang dari kapal pesiar bos, lalu kabur dengan speedboat.' },
];

export const PALETTE = {
  backdrop: '#0d0f1a',
  ground: '#3a332c',
  groundAlt: '#453b31',
  road: '#23232e',
  roadLine: '#c9a227',
  sidewalk: '#4a4238',
  sea: '#14324a',
  seaDeep: '#0e2438',
  tidal: '#1d4258',
  pier: '#6b5a44',
  containerRed: '#a03d2d',
  containerTeal: '#2d7a74',
  containerRust: '#8a5a2b',
  containerBlue: '#33567a',
  gold: '#f2c94c',
  player: '#f2c94c',
  playerDark: '#2b2b33',
  police: '#2f6fd0',
  policeLight: '#e5534b',
  enemy: '#c0392b',
  ped: '#cbb89a',
  text: '#f4ead8',
  muted: '#b8a88f',
  panel: 'rgba(16, 14, 24, 0.88)',
  sunset: '#e8722a',
  sky: '#2a1e33',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
