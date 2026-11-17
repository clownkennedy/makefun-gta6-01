// DOCKLINE world: the rules and state of Port Meridian, with no drawing and
// no browser in it. step() advances one fixed step and returns what happened
// as bit flags, so the caller can react (sound, announcements) without the
// world knowing about screens or sound.
//
// The player walks (WASD), drives cars and trucks (E to enter/exit), sails
// speedboats, steals vehicles (wanted +1), fights with mouse aim + F melee,
// and works through 6 story missions for the dock boss. Wanted 1-5 brings
// police cars, foot cops and, on the water, patrol boats. Wanted decays
// when no police can see the player for a while; police cars slow down
// inside the container yard maze.

import {
  BOAT, BUILDINGS, BULLET, CAR, CRANES, FISH_MARKET, GOLD_CONTAINER, LEDGER_POINT,
  LIGHTHOUSE, MISSIONS, PIERS, PLAYER, ROADS_H, ROADS_V, SAVE_KEY, SEA_X, STEP,
  TIDAL, TIDE_HIGH_SECONDS, TIDE_PERIOD, TRUCK, WANTED_DECAY_SECONDS, WORLD, YACHT, YARDS,
} from './config.js';

export const EVENT_SHOT = 1;
export const EVENT_ENEMY_SHOT = 2;
export const EVENT_HIT = 4;      // player took damage
export const EVENT_BUSTED = 8;
export const EVENT_MISSION = 16; // a mission stage or mission completed
export const EVENT_WIN = 32;
export const EVENT_PICKUP = 64;
export const EVENT_SPLASH = 128;
export const EVENT_PUNCH = 256;

const TAU = Math.PI * 2;

function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function angleTo(ax, ay, bx, by) { return Math.atan2(by - ay, bx - ax); }
function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return d;
}

export function onPier(x, y) {
  for (const p of PIERS) if (x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h) return true;
  return false;
}
export function inSea(x, y) { return x >= SEA_X && !onPier(x, y); }
export function inTidal(x, y) {
  return x >= TIDAL.x && x <= TIDAL.x + TIDAL.w && y >= TIDAL.y && y <= TIDAL.y + TIDAL.h;
}
export function inWater(x, y) { return inSea(x, y) || inTidal(x, y); }
export function inYard(x, y) {
  for (const yard of YARDS) if (x >= yard.x && x <= yard.x + yard.w && y >= yard.y && y <= yard.y + yard.h) return true;
  return false;
}

function circleHitsRect(x, y, r, rect) {
  const cx = clamp(x, rect.x, rect.x + rect.w);
  const cy = clamp(y, rect.y, rect.y + rect.h);
  return (x - cx) * (x - cx) + (y - cy) * (y - cy) < r * r;
}

const CONTAINER_COLORS = ['#a03d2d', '#2d7a74', '#8a5a2b', '#33567a', '#7a3b2e', '#3d6b5a'];

export function createWorld(random, audio) {
  // ---- static collision solids: buildings + crane bases + containers ----
  const solids = [];
  for (const b of BUILDINGS) solids.push({ x: b.x, y: b.y, w: b.w, h: b.h });
  for (const c of CRANES) solids.push({ x: c.x - 30, y: c.y - 30, w: 60, h: 60 });
  solids.push({ x: LIGHTHOUSE.x - 26, y: LIGHTHOUSE.y - 26, w: 52, h: 52 });

  const containers = [];
  for (const yard of YARDS) {
    for (let gx = yard.x + 20; gx + 120 <= yard.x + yard.w - 10; gx += 150) {
      for (let gy = yard.y + 20; gy + 56 <= yard.y + yard.h - 10; gy += 92) {
        // leave alleys open so the yard is a maze, not a wall
        if (random() < 0.22) continue;
        const color = CONTAINER_COLORS[Math.floor(random() * CONTAINER_COLORS.length)];
        const cont = { x: gx, y: gy, w: 120, h: 56, color, gold: false, stacked: random() < 0.3 };
        containers.push(cont);
        solids.push(cont);
      }
    }
  }
  // the gold-marked container: high value, heavily guarded in mission 2
  const gold = { x: GOLD_CONTAINER.x, y: GOLD_CONTAINER.y, w: 120, h: 56, color: '#f2c94c', gold: true, stacked: false };
  containers.push(gold);
  solids.push(gold);

  function hitsSolid(x, y, r) {
    for (let i = 0; i < solids.length; i += 1) if (circleHitsRect(x, y, r, solids[i])) return true;
    return false;
  }

  // ---- state ----
  const player = {
    x: 600, y: 400, angle: 0, health: PLAYER.health, money: 0,
    wanted: 0, vehicle: null, shootTimer: 0, meleeTimer: 0, meleeAnim: 0,
    invulnerable: 0, dead: false,
  };
  const state = {
    player, time: 0, tideT: 12, // start mid high-tide so mission 3 is playable soon
    mission: 0, missionStage: 0, missionTimer: 0, missionText: '',
    target: null, // {x, y, label} marker drawn on map + minimap
    vehicles: [], traffic: [], peds: [], police: [], enemies: [], bullets: [],
    particles: [], tracks: [], convoy: [], message: '', messageT: 0, containers,
    bustedT: 0, winT: 0, policeCooldown: 0, decayT: 0, saveT: 0,
    stats: { stolen: 0, shots: 0, kos: 0, missionsDone: 0 },
    goldTaken: false, ledgerTaken: false, convoyRam: false, rivalLeft: 0,
  };

  function say(text, seconds) {
    state.message = text;
    state.messageT = seconds || 4;
  }

  function setTarget(x, y, label) { state.target = { x, y, label }; }
  function setObjective(text) { state.missionText = text; }

  function spawnParticles(x, y, color, n, speed, life) {
    for (let i = 0; i < n; i += 1) {
      if (state.particles.length > 400) return;
      const a = random() * TAU;
      const s = (0.3 + random() * 0.7) * (speed || 120);
      state.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: (life || 0.6) * (0.5 + random()), max: life || 0.6, color, size: 2 + random() * 4 });
    }
  }

  function addWanted(n) {
    player.wanted = clamp(player.wanted + n, 0, 5);
    if (player.wanted > 0 && audio) audio.startSiren();
  }

  // ---- vehicles ----
  let vehicleId = 1;
  function addVehicle(kind, x, y, angle, color, opts) {
    const v = {
      id: vehicleId, kind, x, y, angle: angle || 0, speed: 0, color: color || '#c8ccd4',
      driver: null, parked: !!(opts && opts.parked), stealable: !!(opts && opts.stealable),
      mission: (opts && opts.mission) || null, route: (opts && opts.route) || null, routeIdx: 0,
      hp: 100, ramCooldown: 0, sunk: false,
    };
    vehicleId += 1;
    state.vehicles.push(v);
    return v;
  }

  function spawnParkedCars() {
    const spots = [
      ['sedan', 700, 452, 0, '#b8443a'], ['sedan', 1200, 352, Math.PI, '#3a6db8'],
      ['taxi', 1500, 1052, Math.PI / 2, '#d8b93a'], ['sedan', 900, 1652, 0, '#5a7a4a'],
      ['sedan', 2100, 2152, Math.PI, '#8a8f96'], ['sedan', 620, 1652, Math.PI / 2, '#a03d6e'],
      ['truck', 1850, 650, 0, '#7a6a3a'], // mission 1 truck (container yard)
      ['sedan', 2350, 1052, 0, '#4a7a8a'], ['truck', 300, 1000, 0, '#6a5a7a'],
    ];
    for (const [kind, x, y, a, color] of spots) addVehicle(kind, x, y, a, color, { parked: true, stealable: true });
  }

  function spawnBoats() {
    addVehicle('boat', 2560, 1400, 0, '#e8e4da', { parked: true, stealable: true }); // tidal channel boat (mission 3)
    addVehicle('boat', 2720, 920, Math.PI / 2, '#d84a3a', { parked: true, stealable: true });
    addVehicle('boat', 2700, 1560, -Math.PI / 2, '#3a8ab8', { parked: true, stealable: true });
  }

  // ---- traffic: cars looping the road grid ----
  const LOOPS = [
    [[400, 400], [2200, 400], [2200, 2100], [400, 2100]],
    [[400, 1000], [1600, 1000], [1600, 1600], [400, 1600]],
    [[1000, 400], [1000, 2100], [2200, 2100], [2200, 400]],
    [[400, 1600], [2200, 1600], [2200, 2100], [400, 2100]],
  ];
  const TRAFFIC_COLORS = ['#b8443a', '#3a6db8', '#5a7a4a', '#8a8f96', '#c8ccd4', '#7a5a9a'];
  function spawnTraffic() {
    for (let i = 0; i < 10; i += 1) {
      const loop = LOOPS[i % LOOPS.length];
      const wp = loop[Math.floor(random() * loop.length)];
      const v = addVehicle('sedan', wp[0] + (random() - 0.5) * 40, wp[1] + (random() - 0.5) * 40, 0,
        TRAFFIC_COLORS[Math.floor(random() * TRAFFIC_COLORS.length)], { route: loop });
      v.driver = 'traffic';
      v.routeIdx = Math.floor(random() * loop.length);
      state.traffic.push(v);
    }
  }

  // ---- pedestrians on the sidewalks ----
  function spawnPeds() {
    for (let i = 0; i < 22; i += 1) {
      const roadH = ROADS_H[Math.floor(random() * ROADS_H.length)];
      const roadV = ROADS_V[Math.floor(random() * ROADS_V.length)];
      const onH = random() < 0.5;
      state.peds.push({
        x: onH ? 150 + random() * 2300 : roadV + (random() < 0.5 ? -62 : 62),
        y: onH ? roadH + (random() < 0.5 ? -62 : 62) : 150 + random() * 1900,
        angle: random() * TAU, speed: 45 + random() * 35, target: null, flee: 0,
        color: ['#cbb89a', '#9ab8c8', '#c89a9a', '#a8c89a'][Math.floor(random() * 4)],
        wait: random() * 3,
      });
    }
  }

  function nearestVehicle(x, y, maxD, kinds) {
    let best = null;
    let bestD = maxD;
    for (const v of state.vehicles) {
      if (v.sunk || v.driver === 'traffic') continue;
      if (kinds && !kinds.includes(v.kind)) continue;
      const d = dist(x, y, v.x, v.y);
      if (d < bestD) { bestD = d; best = v; }
    }
    return best;
  }

  function enterVehicle(v) {
    if (!v || v.driver) return false;
    v.driver = 'player';
    v.parked = false;
    player.vehicle = v;
    player.x = v.x;
    player.y = v.y;
    if (v.stealable) {
      state.stats.stolen += 1;
      addWanted(1);
      say(v.kind === 'boat' ? 'Speedboat dicuri! Polisi pelabuhan waspada.' : 'Mobil dicuri! Wanted +1 bintang.');
      if (audio) audio.alarm();
    }
    return true;
  }

  function exitVehicle() {
    const v = player.vehicle;
    if (!v) return;
    v.driver = null;
    // step out to the side, on land if possible
    const side = v.angle + Math.PI / 2;
    let px = v.x + Math.cos(side) * 40;
    let py = v.y + Math.sin(side) * 40;
    if (v.kind === 'boat') {
      // step onto the nearest pier / shore
      px = clamp(v.x, 0, WORLD.width); py = v.y;
      if (!onPier(px, py) && inSea(px, py)) { px = SEA_X - 30; }
    }
    if (hitsSolid(px, py, PLAYER.radius)) { px = v.x - Math.cos(side) * 40; py = v.y - Math.sin(side) * 40; }
    player.x = clamp(px, 20, WORLD.width - 20);
    player.y = clamp(py, 20, WORLD.height - 20);
    player.vehicle = null;
    v.speed = 0;
  }

  // ---- enemies ----
  function spawnEnemy(x, y, kind) {
    const e = {
      x, y, angle: 0, hp: kind === 'rival' ? 60 : kind === 'guard' ? 50 : 40,
      kind, shootTimer: 1 + random() * 1.5, speed: kind === 'cop' ? 150 : 110,
      hitFlash: 0, dead: false,
    };
    state.enemies.push(e);
    return e;
  }

  function spawnPoliceCar() {
    const edge = [
      [300, 300], [2300, 300], [300, 2200], [2300, 2200], [1200, 300], [300, 1200],
    ][Math.floor(random() * 6)];
    const v = addVehicle('police', edge[0], edge[1], 0, '#2f6fd0', {});
    v.driver = 'police';
    state.police.push({ vehicle: v, foot: null, ramCooldown: 0 });
    return v;
  }

  function spawnFootCop(x, y) {
    const e = spawnEnemy(x, y, 'cop');
    state.police.push({ vehicle: null, foot: e, ramCooldown: 0 });
    return e;
  }

  function spawnPatrolBoat() {
    const v = addVehicle('boat', 3050, 300 + random() * 1800, Math.PI, '#2f6fd0', {});
    v.driver = 'police';
    state.police.push({ vehicle: v, foot: null, ramCooldown: 0 });
    return v;
  }

  function clearPolice() {
    for (const p of state.police) {
      if (p.vehicle) { p.vehicle.driver = null; p.vehicle.sunk = true; }
      if (p.foot) p.foot.dead = true;
    }
    state.police = [];
    state.enemies = state.enemies.filter((e) => e.kind !== 'cop');
    if (audio) audio.stopSiren();
  }

  // ---- movement + collision ----
  // mode: 'foot' | 'car' | 'boat'. Returns nothing; position is clamped in place.
  function moveCircle(ent, dx, dy, r, mode) {
    let nx = ent.x + dx;
    if (!hitsSolid(nx, ent.y, r) && nx > r && nx < WORLD.width - r) {
      if (mode === 'car' && inWater(nx, ent.y)) { /* blocked by water */ }
      else if (mode === 'boat' && !inWater(nx, ent.y) && !onPier(nx, ent.y)) { /* beached */ }
      else if (mode === 'foot' && inSea(nx, ent.y) && !onPier(nx, ent.y)) { /* cannot swim */ }
      else ent.x = nx;
    }
    let ny = ent.y + dy;
    if (!hitsSolid(ent.x, ny, r) && ny > r && ny < WORLD.height - r) {
      if (mode === 'car' && inWater(ent.x, ny)) { /* blocked */ }
      else if (mode === 'boat' && !inWater(ent.x, ny) && !onPier(ent.x, ny)) { /* beached */ }
      else if (mode === 'foot' && inSea(ent.x, ny) && !onPier(ent.x, ny)) { /* cannot swim */ }
      else ent.y = ny;
    }
  }

  function vehicleStats(v) {
    if (v.kind === 'boat') return BOAT;
    if (v.kind === 'truck') return TRUCK;
    return CAR;
  }

  function driveVehicle(v, ctl, dt) {
    const st = vehicleStats(v);
    const inYardZone = inYard(v.x, v.y);
    const top = v.driver === 'police' && inYardZone ? st.maxSpeed * 0.45 : st.maxSpeed; // yard maze slows police
    const throttle = ctl.y; // -1 forward (W), +1 reverse (S)
    if (throttle < 0) v.speed += st.accel * dt;
    else if (throttle > 0) {
      if (v.speed > 10) v.speed -= st.brake * dt;
      else v.speed -= st.accel * 0.6 * dt;
    } else {
      v.speed -= Math.sign(v.speed) * 140 * dt;
      if (Math.abs(v.speed) < 8) v.speed = 0;
    }
    v.speed = clamp(v.speed, -st.reverseMax, top);
    if (Math.abs(v.speed) > 20) v.angle += ctl.x * st.turnRate * (v.speed / top) * dt * (v.speed < 0 ? -1 : 1);
    const dx = Math.cos(v.angle) * v.speed * dt;
    const dy = Math.sin(v.angle) * v.speed * dt;
    const beforeX = v.x;
    const beforeY = v.y;
    moveCircle(v, dx, dy, st.radius, v.kind === 'boat' ? 'boat' : 'car');
    if ((v.x === beforeX && v.y === beforeY) && Math.abs(v.speed) > 60) {
      v.speed *= 0.4; // thud into something solid
      spawnParticles(v.x + Math.cos(v.angle) * 30, v.y + Math.sin(v.angle) * 30, '#d8c9a8', 6, 90, 0.4);
    }
    // tire tracks / wake when moving fast or turning hard
    if (Math.abs(v.speed) > 200) {
      const bx = v.x - Math.cos(v.angle) * 26;
      const by = v.y - Math.sin(v.angle) * 26;
      if (state.tracks.length > 300) state.tracks.shift();
      state.tracks.push({ x: bx, y: by, angle: v.angle, life: v.kind === 'boat' ? 0.9 : 1.6, kind: v.kind });
    }
    if (v.kind === 'boat' && Math.abs(v.speed) > 60) {
      spawnParticles(v.x - Math.cos(v.angle) * 30, v.y - Math.sin(v.angle) * 30, '#bfe0f0', 2, 60, 0.5);
    }
  }

  // ---- combat ----
  function fireBullet(x, y, angle, fromPlayer) {
    const speed = fromPlayer ? BULLET.playerSpeed : BULLET.enemySpeed;
    state.bullets.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: BULLET.range / speed, fromPlayer });
  }

  function playerShoot(aimAngle) {
    if (player.shootTimer > 0 || player.vehicle) return;
    player.shootTimer = PLAYER.shootCooldown;
    state.stats.shots += 1;
    const gx = player.x + Math.cos(aimAngle) * 22;
    const gy = player.y + Math.sin(aimAngle) * 22;
    fireBullet(gx, gy, aimAngle, true);
    spawnParticles(gx, gy, '#ffd76a', 4, 140, 0.2);
    if (audio) audio.shot();
  }

  function playerMelee(aimAngle) {
    if (player.meleeTimer > 0 || player.vehicle) return;
    player.meleeTimer = PLAYER.meleeCooldown;
    player.meleeAnim = 0.25;
    if (audio) audio.punch();
    const mx = player.x + Math.cos(aimAngle) * 40;
    const my = player.y + Math.sin(aimAngle) * 40;
    spawnParticles(mx, my, '#e8dcc0', 5, 120, 0.25);
    for (const e of state.enemies) {
      if (e.dead) continue;
      if (dist(player.x, player.y, e.x, e.y) < PLAYER.meleeRange + 14) {
        e.hp -= PLAYER.meleeDamage;
        e.hitFlash = 0.2;
        if (e.hp <= 0) killEnemy(e);
      }
    }
  }

  function killEnemy(e) {
    e.dead = true;
    state.stats.kos += 1;
    spawnParticles(e.x, e.y, '#c0392b', 14, 160, 0.7);
    if (e.kind === 'rival') state.rivalLeft = Math.max(0, state.rivalLeft - 1);
  }

  function damagePlayer(amount, source) {
    if (player.invulnerable > 0 || player.dead) return;
    player.health -= amount;
    player.invulnerable = 0.4;
    spawnParticles(player.x, player.y, '#e5534b', 8, 130, 0.5);
    if (audio) audio.hit();
    if (player.health <= 0) {
      player.health = 0;
      player.dead = true;
      state.bustedT = 0;
      if (audio) audio.busted();
    }
  }

  // ---- missions ----
  function missionTruck() {
    return state.vehicles.find((v) => v.kind === 'truck' && v.x > 1700 && v.x < 2000 && v.y > 550 && v.y < 750);
  }

  function startMission(i) {
    state.mission = i;
    state.missionStage = 0;
    state.missionTimer = 0;
    const m = MISSIONS[i];
    say(`MISI ${i + 1}: ${m.name} — ${m.brief}`, 6);
    if (audio) audio.pickup();
    if (i === 0) {
      setObjective('Curi truk kontainer di lapangan (tanda kuning).');
      setTarget(1850, 650, 'TRUK');
    } else if (i === 1) {
      setObjective('Masuk gudang besar, lalu ambil kontainer EMAS.');
      setTarget(1210, 570, 'GUDANG');
    } else if (i === 2) {
      setObjective('Naik speedboat di kanal pasang (tunggu PASANG).');
      setTarget(2560, 1400, 'BOAT');
    } else if (i === 3) {
      setObjective('Ke pasar ikan — lindungi serah-terima.');
      setTarget(2410, 1850, 'PASAR IKAN');
    } else if (i === 4) {
      setObjective('Cari konvoi truk di jalan raya, ram truk tengah.');
      setTarget(1200, 1000, 'KONVOI');
      spawnConvoy();
    } else if (i === 5) {
      setObjective('Naik ke dermaga utara, curi buku utang dari kapal pesiar.');
      setTarget(LEDGER_POINT.x, LEDGER_POINT.y, 'KAPAL PESIAR');
    }
  }

  function completeMission() {
    const m = MISSIONS[state.mission];
    player.money += m.reward;
    state.stats.missionsDone += 1;
    say(`MISI SELESAI: ${m.name} +$${m.reward}`, 5);
    if (audio) audio.cash();
    saveGame();
    if (state.mission >= MISSIONS.length - 1) {
      state.winT = 0.01; // win screen triggers in step()
      return;
    }
    startMission(state.mission + 1);
  }

  function spawnConvoy() {
    state.convoy = [];
    for (let i = 0; i < 3; i += 1) {
      const v = addVehicle('truck', 500 + i * 130, 1000, 0, i === 1 ? '#c8a03a' : '#6a6f7a', { mission: 'convoy' });
      v.driver = 'traffic';
      v.speed = 190;
      state.convoy.push(v);
    }
    state.convoyRam = false;
  }

  function updateMissions(dt, ctl) {
    const m = state.mission;
    const p = player;
    if (m === 0) {
      if (state.missionStage === 0) {
        const truck = missionTruck();
        if (truck && p.vehicle === truck) {
          state.missionStage = 1;
          state.missionTimer = 150;
          setObjective('Antar truk ke titik drop di selatan sebelum patroli datang!');
          setTarget(480, 2100, 'DROP');
          say('Truk didapat! Ke titik drop, cepat!', 4);
        }
      } else if (state.missionStage === 1) {
        state.missionTimer -= dt;
        if (p.vehicle && p.vehicle.kind === 'truck' && dist(p.x, p.y, 480, 2100) < 110) {
          completeMission();
        } else if (state.missionTimer <= 0) {
          state.missionStage = 0;
          setObjective('Waktu habis! Curi lagi truk kontainer di lapangan.');
          setTarget(1850, 650, 'TRUK');
          say('Patroli datang — misi gagal, coba lagi.', 4);
        }
      }
    } else if (m === 1) {
      if (state.missionStage === 0) {
        if (dist(p.x, p.y, 1210, 570) < 120) {
          state.missionStage = 1;
          setObjective('Ambil kontainer EMAS di lapangan (tekan E di dekatnya).');
          setTarget(GOLD_CONTAINER.x, GOLD_CONTAINER.y, 'EMAS');
          for (let i = 0; i < 3; i += 1) spawnEnemy(2050 + i * 60, 700 + (i % 2) * 80, 'guard');
          say('Penjaga gudang datang!', 4);
          addWanted(1);
        }
      } else if (state.missionStage === 1) {
        if (state.goldTaken) {
          state.missionStage = 2;
          setObjective('Kabur lewat gang gudang ke titik aman!');
          setTarget(1000, 1600, 'AMAN');
          addWanted(2);
          say('Emas didapat! Kabur!', 4);
        }
      } else if (state.missionStage === 2) {
        if (dist(p.x, p.y, 1000, 1600) < 110) completeMission();
      }
    } else if (m === 2) {
      if (state.missionStage === 0) {
        if (p.vehicle && p.vehicle.kind === 'boat') {
          state.missionStage = 1;
          setObjective('Bawa speedboat ke laut lepas (tanda biru). Hati-hati: kanal dangkal saat SURUT!');
          setTarget(3050, 1400, 'LAUT LEPAS');
        }
      } else if (state.missionStage === 1) {
        if (p.vehicle && p.vehicle.kind === 'boat' && dist(p.x, p.y, 3050, 1400) < 130) completeMission();
      }
    } else if (m === 3) {
      if (state.missionStage === 0) {
        if (dist(p.x, p.y, 2410, 1850) < 150) {
          state.missionStage = 1;
          state.rivalLeft = 6;
          for (let i = 0; i < 6; i += 1) spawnEnemy(2280 + (i % 3) * 120, 1760 + Math.floor(i / 3) * 120, 'rival');
          setObjective('Geng rival menyerang! Habisi mereka semua (sisa: 6).');
          setTarget(2410, 1850, 'BERTAHAN');
          say('Geng rival datang! Lindungi serah-terima!', 4);
          addWanted(1);
        }
      } else if (state.missionStage === 1) {
        setObjective(`Geng rival menyerang! Habisi mereka semua (sisa: ${state.rivalLeft}).`);
        if (state.rivalLeft <= 0) completeMission();
      }
    } else if (m === 4) {
      if (state.missionStage === 0) {
        const middle = state.convoy[1];
        if (middle && state.convoyRam) {
          state.missionStage = 1;
          setObjective('Truk tengah berhenti! Curi truknya (E), antar ke drop utara.');
          setTarget(middle.x, middle.y, 'TRUK TENGAH');
          say('Konvoi terhenti! Curi truk tengah!', 4);
        }
      } else if (state.missionStage === 1) {
        const middle = state.convoy[1];
        if (middle && p.vehicle === middle) {
          state.missionStage = 2;
          setObjective('Antar truk curian ke titik drop utara.');
          setTarget(480, 400, 'DROP');
        }
      } else if (state.missionStage === 2) {
        const middle = state.convoy[1];
        if (middle && p.vehicle === middle && dist(p.x, p.y, 480, 400) < 110) completeMission();
      }
    } else if (m === 5) {
      if (state.missionStage === 0) {
        if (dist(p.x, p.y, LEDGER_POINT.x, LEDGER_POINT.y) < 90 && !p.vehicle) {
          state.missionStage = 1;
          setObjective('Ambil buku catatan utang (tekan E).');
          setTarget(LEDGER_POINT.x, LEDGER_POINT.y, 'BUKU UTANG');
        }
      } else if (state.missionStage === 1) {
        if (state.ledgerTaken) {
          state.missionStage = 2;
          setObjective('Kabur! Naik speedboat dan ke laut lepas!');
          setTarget(2720, 920, 'BOAT');
          addWanted(4);
          say('Buku utang didapat! Polisi pelabuhan mengejar!', 5);
        }
      } else if (state.missionStage === 2) {
        if (p.vehicle && p.vehicle.kind === 'boat') {
          state.missionStage = 3;
          setObjective('Kabur ke laut lepas — jangan sampai tertangkap!');
          setTarget(3100, 600, 'BEBAS');
        }
      } else if (state.missionStage === 3) {
        if (p.vehicle && p.vehicle.kind === 'boat' && dist(p.x, p.y, 3100, 600) < 140) completeMission();
      }
    }
  }

  // interact (E): enter/exit vehicle, pick up mission items
  function tryInteract() {
    const p = player;
    if (p.vehicle) { exitVehicle(); return; }
    // mission pickups
    if (state.mission === 1 && state.missionStage === 1 && dist(p.x, p.y, GOLD_CONTAINER.x, GOLD_CONTAINER.y) < 110) {
      state.goldTaken = true;
      say('Kontainer emas diamankan!', 3);
      if (audio) audio.pickup();
      return;
    }
    if (state.mission === 5 && state.missionStage === 1 && dist(p.x, p.y, LEDGER_POINT.x, LEDGER_POINT.y) < 90) {
      state.ledgerTaken = true;
      say('Buku catatan utang didapat!', 3);
      if (audio) audio.pickup();
      return;
    }
    const v = nearestVehicle(p.x, p.y, 70, null);
    if (v) enterVehicle(v);
  }

  function promptText() {
    const p = player;
    if (p.vehicle) return 'E — keluar kendaraan';
    if (state.mission === 1 && state.missionStage === 1 && dist(p.x, p.y, GOLD_CONTAINER.x, GOLD_CONTAINER.y) < 110) return 'E — ambil kontainer emas';
    if (state.mission === 5 && state.missionStage === 1 && dist(p.x, p.y, LEDGER_POINT.x, LEDGER_POINT.y) < 90) return 'E — ambil buku utang';
    const v = nearestVehicle(p.x, p.y, 70, null);
    if (v) return v.kind === 'boat' ? 'E — naik speedboat' : 'E — masuk kendaraan (curi)';
    return '';
  }

  // ---- save / load ----
  function saveGame() {
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify({
        money: player.money, mission: state.mission, x: player.x, y: player.y, health: player.health,
      }));
    } catch { /* storage off */ }
  }

  function loadGame() {
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const s = JSON.parse(raw);
      if (typeof s.money !== 'number' || typeof s.mission !== 'number') return false;
      player.money = s.money;
      player.x = clamp(s.x || 600, 20, WORLD.width - 20);
      player.y = clamp(s.y || 400, 20, WORLD.height - 20);
      player.health = s.health || PLAYER.health;
      startMission(clamp(s.mission, 0, MISSIONS.length - 1));
      return true;
    } catch { return false; }
  }

  function hasSave() {
    try { return !!window.localStorage.getItem(SAVE_KEY); } catch { return false; }
  }

  // ---- per-step updates ----
  function updateTraffic(dt) {
    for (const v of state.traffic) {
      if (!v.route) continue;
      const wp = v.route[v.routeIdx];
      const d = dist(v.x, v.y, wp[0], wp[1]);
      if (d < 30) { v.routeIdx = (v.routeIdx + 1) % v.route.length; continue; }
      const targetAngle = angleTo(v.x, v.y, wp[0], wp[1]);
      v.angle += clamp(angleDiff(v.angle, targetAngle), -2.2 * dt, 2.2 * dt);
      v.speed = 170;
      const dx = Math.cos(v.angle) * v.speed * dt;
      const dy = Math.sin(v.angle) * v.speed * dt;
      const ox = v.x;
      const oy = v.y;
      moveCircle(v, dx, dy, CAR.radius, 'car');
      if (v.x === ox && v.y === oy) v.routeIdx = (v.routeIdx + 1) % v.route.length; // stuck: skip waypoint
    }
    // convoy trucks drive east along the y=1000 road, looping back
    for (const v of state.convoy) {
      if (state.mission === 4 && state.missionStage === 0 && !state.convoyRam) {
        v.x += v.speed * dt;
        v.angle = 0;
        if (v.x > 2500) { // loop the convoy back to the west end
          for (let i = 0; i < state.convoy.length; i += 1) state.convoy[i].x = 400 + i * 130;
        }
      }
    }
  }

  function updatePeds(dt) {
    for (const ped of state.peds) {
      if (ped.flee > 0) {
        ped.flee -= dt;
        const a = angleTo(player.x, player.y, ped.x, ped.y);
        moveCircle(ped, Math.cos(a) * 150 * dt, Math.sin(a) * 150 * dt, 10, 'foot');
        continue;
      }
      if (ped.wait > 0) { ped.wait -= dt; continue; }
      if (!ped.target) {
        const roadH = ROADS_H[Math.floor(random() * ROADS_H.length)];
        ped.target = { x: 150 + random() * 2300, y: roadH + (random() < 0.5 ? -62 : 62) };
      }
      const d = dist(ped.x, ped.y, ped.target.x, ped.target.y);
      if (d < 12) { ped.target = null; ped.wait = 1 + random() * 3; continue; }
      const a = angleTo(ped.x, ped.y, ped.target.x, ped.target.y);
      ped.angle = a;
      moveCircle(ped, Math.cos(a) * ped.speed * dt, Math.sin(a) * ped.speed * dt, 10, 'foot');
    }
  }

  function updatePolice(dt) {
    // desired police presence grows with wanted
    const wantCars = player.wanted >= 1 ? Math.min(3, player.wanted) : 0;
    const inBoat = player.vehicle && player.vehicle.kind === 'boat';
    const wantBoats = inBoat && player.wanted >= 2 ? Math.min(3, player.wanted - 1) : 0;
    state.policeCooldown -= dt;
    if (state.policeCooldown <= 0) {
      const cars = state.police.filter((p) => p.vehicle && p.vehicle.kind !== 'boat').length;
      const boats = state.police.filter((p) => p.vehicle && p.vehicle.kind === 'boat').length;
      if (cars < wantCars) spawnPoliceCar();
      else if (boats < wantBoats) spawnPatrolBoat();
      else if (player.wanted >= 3 && !inBoat) {
        const cops = state.police.filter((p) => p.foot).length;
        if (cops < player.wanted - 2) spawnFootCop(player.x + (random() - 0.5) * 500, player.y + (random() - 0.5) * 500);
      }
      state.policeCooldown = 1.2;
    }
    // chase
    for (const p of state.police) {
      if (p.vehicle) {
        const v = p.vehicle;
        const d = dist(v.x, v.y, player.x, player.y);
        const targetAngle = angleTo(v.x, v.y, player.x, player.y);
        const ctl = { x: clamp(angleDiff(v.angle, targetAngle) * 2, -1, 1), y: d > 60 ? -1 : 0 };
        driveVehicle(v, ctl, dt);
        // ram the player
        if (d < 60 && p.ramCooldown <= 0) {
          p.ramCooldown = 1.2;
          if (player.vehicle && player.vehicle !== v) {
            player.vehicle.speed *= 0.5;
            spawnParticles(player.x, player.y, '#e8dcc0', 10, 150, 0.5);
            damagePlayer(6, 'ram');
          } else if (!player.vehicle) {
            damagePlayer(10, 'ram');
          }
        }
        p.ramCooldown -= dt;
        // police car that gets too far away gives up and despawns
        if (d > 1800) { v.sunk = true; v.driver = null; }
      } else if (p.foot && !p.foot.dead) {
        const e = p.foot;
        const d = dist(e.x, e.y, player.x, player.y);
        const a = angleTo(e.x, e.y, player.x, player.y);
        e.angle = a;
        moveCircle(e, Math.cos(a) * e.speed * dt, Math.sin(a) * e.speed * dt, 12, 'foot');
        if (d < 26 && !player.vehicle) {
          // caught on foot: busted
          player.dead = true;
          state.bustedT = 0;
          if (audio) audio.busted();
        }
      }
    }
    state.police = state.police.filter((p) => !(p.vehicle && p.vehicle.sunk) && !(p.foot && p.foot.dead));
    // wanted decay: no police within 520 units for a while
    let nearest = Infinity;
    for (const p of state.police) {
      const e = p.vehicle || p.foot;
      if (e) nearest = Math.min(nearest, dist(e.x, e.y, player.x, player.y));
    }
    if (player.wanted > 0 && nearest > 520) {
      state.decayT += dt;
      if (state.decayT >= WANTED_DECAY_SECONDS) {
        state.decayT = 0;
        player.wanted -= 1;
        say(player.wanted === 0 ? 'Kamu lolos. Wanted hilang.' : `Wanted turun ke ${player.wanted} bintang.`, 3);
        if (player.wanted === 0) clearPolice();
      }
    } else state.decayT = 0;
    if (player.wanted === 0 && state.police.length > 0 && nearest > 900) clearPolice();
  }

  function updateEnemies(dt) {
    for (const e of state.enemies) {
      if (e.dead) continue;
      e.hitFlash = Math.max(0, e.hitFlash - dt);
      const d = dist(e.x, e.y, player.x, player.y);
      const a = angleTo(e.x, e.y, player.x, player.y);
      e.angle = a;
      if (d > 320) {
        moveCircle(e, Math.cos(a) * e.speed * dt, Math.sin(a) * e.speed * dt, 12, 'foot');
      } else if (d > 90) {
        // strafe closer, keep shooting
        moveCircle(e, Math.cos(a) * e.speed * 0.6 * dt, Math.sin(a) * e.speed * 0.6 * dt, 12, 'foot');
      }
      e.shootTimer -= dt;
      if (e.shootTimer <= 0 && d < 560 && !player.dead) {
        e.shootTimer = 1.1 + random() * 0.9;
        const jitter = (random() - 0.5) * 0.25;
        fireBullet(e.x + Math.cos(a) * 20, e.y + Math.sin(a) * 20, a + jitter, false);
        if (audio) audio.enemyShot();
      }
    }
    state.enemies = state.enemies.filter((e) => !e.dead || e.kind === 'cop');
  }

  function updateBullets(dt) {
    let events = 0;
    for (const b of state.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || b.x < 0 || b.x > WORLD.width || b.y < 0 || b.y > WORLD.height) continue;
      if (hitsSolid(b.x, b.y, 2)) { b.life = 0; spawnParticles(b.x, b.y, '#c9b896', 3, 80, 0.25); continue; }
      if (b.fromPlayer) {
        for (const e of state.enemies) {
          if (e.dead) continue;
          if (dist(b.x, b.y, e.x, e.y) < 18) {
            b.life = 0;
            e.hp -= BULLET.damage;
            e.hitFlash = 0.2;
            spawnParticles(b.x, b.y, '#e5534b', 6, 120, 0.4);
            if (e.hp <= 0) killEnemy(e);
            break;
          }
        }
        // shooting a pedestrian or a cop raises the heat
        if (b.life > 0) {
          for (const ped of state.peds) {
            if (dist(b.x, b.y, ped.x, ped.y) < 14) {
              b.life = 0;
              ped.flee = 6;
              addWanted(1);
              say('Kamu menembak warga! Wanted naik.', 3);
              break;
            }
          }
        }
      } else {
        const targetR = player.vehicle ? 26 : PLAYER.radius;
        if (dist(b.x, b.y, player.x, player.y) < targetR + 4) {
          b.life = 0;
          damagePlayer(BULLET.enemyDamage, 'shot');
          events |= EVENT_HIT;
        }
      }
    }
    state.bullets = state.bullets.filter((b) => b.life > 0);
    return events;
  }

  function updateParticles(dt) {
    for (const pt of state.particles) {
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= 0.92;
      pt.vy *= 0.92;
      pt.life -= dt;
    }
    state.particles = state.particles.filter((pt) => pt.life > 0);
    for (const t of state.tracks) t.life -= dt;
    state.tracks = state.tracks.filter((t) => t.life > 0);
  }

  // ramming the middle convoy truck
  function checkConvoyRam() {
    if (state.mission !== 4 || state.missionStage !== 0 || state.convoyRam) return;
    const middle = state.convoy[1];
    if (!middle || !player.vehicle || player.vehicle === middle) return;
    if (dist(player.x, player.y, middle.x, middle.y) < 55 && Math.abs(player.vehicle.speed) > 150) {
      state.convoyRam = true;
      middle.driver = null;
      middle.speed = 0;
      spawnParticles(middle.x, middle.y, '#e8dcc0', 20, 200, 0.7);
      say('Truk tengah kena ram!', 3);
      if (audio) audio.hit();
    }
  }

  function reset(keepMoney, keepMission) {
    const mission = keepMission ? state.mission : 0;
    player.x = 600;
    player.y = 400;
    player.angle = 0;
    player.health = PLAYER.health;
    player.wanted = 0;
    player.vehicle = null;
    player.dead = false;
    player.shootTimer = 0;
    player.meleeTimer = 0;
    clearPolice();
    state.enemies = state.enemies.filter((e) => e.kind !== 'cop');
    state.bullets = [];
    state.goldTaken = false;
    state.ledgerTaken = false;
    state.convoy = [];
    if (!keepMoney) player.money = 0;
    startMission(mission);
  }

  function step(dt, ctl) {
    let events = 0;
    state.time += dt;
    state.tideT = (state.tideT + dt) % TIDE_PERIOD;
    if (state.messageT > 0) state.messageT -= dt;
    player.invulnerable = Math.max(0, player.invulnerable - dt);
    player.shootTimer = Math.max(0, player.shootTimer - dt);
    player.meleeTimer = Math.max(0, player.meleeTimer - dt);
    player.meleeAnim = Math.max(0, player.meleeAnim - dt);

    // busted / win sequencing handled by the caller screens, but keep timers here
    if (player.dead) {
      state.bustedT += dt;
      return EVENT_BUSTED;
    }
    if (state.winT > 0) {
      state.winT += dt;
      return EVENT_WIN;
    }

    if (ctl.interact) tryInteract();
    if (ctl.melee) { playerMelee(ctl.aimAngle); events |= EVENT_PUNCH; }
    if (ctl.shoot) playerShoot(ctl.aimAngle);

    // player movement
    if (player.vehicle) {
      const v = player.vehicle;
      player.x = v.x;
      player.y = v.y;
      player.angle = v.angle;
      const wasInWater = inWater(v.x, v.y);
      driveVehicle(v, ctl.move, dt);
      player.x = v.x;
      player.y = v.y;
      if (v.kind === 'boat' && !wasInWater && inWater(v.x, v.y) && audio) { audio.splash(); events |= EVENT_SPLASH; }
      // boat stuck in the tidal channel at low tide
      if (v.kind === 'boat' && inTidal(v.x, v.y) && !tideHigh()) v.speed *= 0.85;
    } else {
      const mv = ctl.move;
      const len = Math.hypot(mv.x, mv.y) || 1;
      const speed = inWater(player.x, player.y) ? PLAYER.wadeSpeed : PLAYER.walkSpeed;
      if (mv.x !== 0 || mv.y !== 0) {
        moveCircle(player, (mv.x / len) * speed * dt, (mv.y / len) * speed * dt, PLAYER.radius, 'foot');
        player.angle = ctl.aimAngle;
      }
      // running over a pedestrian while on foot does nothing; driving into one does
    }

    // driving into a pedestrian: wanted up, ped flees
    if (player.vehicle) {
      for (const ped of state.peds) {
        if (dist(player.x, player.y, ped.x, ped.y) < 30) {
          ped.flee = 6;
          if (player.vehicle.ramCooldown <= 0) {
            player.vehicle.ramCooldown = 1;
            addWanted(1);
            say('Kamu menabrak pejalan kaki! Wanted naik.', 3);
          }
          // shove the ped aside
          const a = angleTo(player.x, player.y, ped.x, ped.y);
          ped.x += Math.cos(a) * 40;
          ped.y += Math.sin(a) * 40;
        }
      }
      player.vehicle.ramCooldown = Math.max(0, player.vehicle.ramCooldown - dt);
    }

    checkConvoyRam();
    updateTraffic(dt);
    updatePeds(dt);
    updatePolice(dt);
    updateEnemies(dt);
    events |= updateBullets(dt);
    updateParticles(dt);
    updateMissions(dt, ctl);

    // slow health regen when the heat is off
    if (player.wanted === 0 && player.health > 0 && player.health < PLAYER.health) {
      player.health = Math.min(PLAYER.health, player.health + 2 * dt);
    }

    // periodic autosave
    state.saveT += dt;
    if (state.saveT > 15) { state.saveT = 0; saveGame(); }

    if (audio) {
      audio.setEngine(player.vehicle ? player.vehicle.speed / 540 : 0, !!player.vehicle);
      audio.updateSiren(dt, player.wanted);
    }
    return events;
  }

  function tideHigh() { return state.tideT < TIDE_HIGH_SECONDS; }
  function tideSecondsLeft() {
    return tideHigh() ? TIDE_HIGH_SECONDS - state.tideT : TIDE_PERIOD - state.tideT;
  }

  // ---- boot ----
  spawnParkedCars();
  spawnBoats();
  spawnTraffic();
  spawnPeds();
  startMission(0);
  say('Selamat datang di Port Meridian. Ikuti tanda kuning — misi pertama: curi truk kontainer.', 6);

  return {
    state, player, containers, solids,
    step, reset, saveGame, loadGame, hasSave, tryInteract, promptText,
    tideHigh, tideSecondsLeft, inYard,
    // helpers for the screenshot stager
    _addVehicle: addVehicle,
    _spawnEnemy: spawnEnemy,
    _spawnPoliceCar: spawnPoliceCar,
    _spawnPatrolBoat: spawnPatrolBoat,
    _enterVehicle: enterVehicle,
    _startMission: startMission,
    _setTarget: setTarget,
    _setObjective: setObjective,
    _addWanted: addWanted,
    _say: say,
  };
}
