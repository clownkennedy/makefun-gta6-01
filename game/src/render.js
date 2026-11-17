// Drawing only: the world's state and the current screen in, pixels out.
// Camera follows the player with a slight zoom-out at driving speed; the
// sunset palette (orange dusk + steel blue sea) is painted with flat shapes,
// glow and a rotating lighthouse beam. HUD, minimap, mission banner and
// panels are drawn in screen space.
import {
  BUILDINGS, CRANES, FISH_MARKET, FONT, GOLD_CONTAINER, LEDGER_POINT, LIGHTHOUSE,
  MISSIONS, PALETTE, PIERS, ROADS_H, ROADS_V, ROAD_HALF, SEA_X, TIDAL, WORLD, YACHT, YARDS,
} from './config.js';
import { inSea, inTidal, inWater } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over'; // busted
export const SCREEN_WIN = 'win';

const TAU = Math.PI * 2;

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0, zoom: 1, camX: 600, camY: 400 };
  const fonts = new Map();

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(window.innerWidth * ratio);
    canvas.height = Math.round(window.innerHeight * ratio);
  }

  function text(value, x, y, size, color, align, baseline) {
    if (!fonts.has(size)) fonts.set(size, `bold ${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.textBaseline = baseline || 'alphabetic';
    context.fillText(value, x, y);
  }

  function updateCamera(state, dt) {
    const p = state.player;
    const targetZoom = p.vehicle ? 0.72 + 0.1 * Math.max(0, 1 - Math.abs(p.vehicle.speed) / 600) : 1;
    view.zoom += (targetZoom - view.zoom) * Math.min(1, dt * 2);
    view.camX += (p.x - view.camX) * Math.min(1, dt * 6);
    view.camY += (p.y - view.camY) * Math.min(1, dt * 6);
    const vw = canvas.width / view.zoom;
    const vh = canvas.height / view.zoom;
    view.camX = Math.max(vw / 2 - 200, Math.min(WORLD.width - vw / 2 + 200, view.camX));
    view.camY = Math.max(vh / 2 - 200, Math.min(WORLD.height - vh / 2 + 200, view.camY));
  }

  function screenToWorld(sx, sy) {
    return {
      x: view.camX + (sx - canvas.width / 2) / view.zoom,
      y: view.camY + (sy - canvas.height / 2) / view.zoom,
    };
  }

  function drawWorld(state, time) {
    const ctx = context;
    const p = state.player;
    const vx0 = view.camX - canvas.width / view.zoom / 2 - 80;
    const vy0 = view.camY - canvas.height / view.zoom / 2 - 80;
    const vx1 = view.camX + canvas.width / view.zoom / 2 + 80;
    const vy1 = view.camY + canvas.height / view.zoom / 2 + 80;
    const inView = (x, y, w, h) => x + w > vx0 && x < vx1 && y + h > vy0 && y < vy1;

    // ground
    ctx.fillStyle = PALETTE.ground;
    ctx.fillRect(vx0, vy0, vx1 - vx0, vy1 - vy0);
    // subtle ground patches
    ctx.fillStyle = PALETTE.groundAlt;
    for (let gx = 0; gx < WORLD.width; gx += 320) {
      for (let gy = 0; gy < WORLD.height; gy += 320) {
        if ((gx / 320 + gy / 320) % 2 === 0 && inView(gx, gy, 320, 320)) ctx.fillRect(gx, gy, 320, 320);
      }
    }

    // sea (east) + tidal channel
    const wave = Math.sin(time * 1.4) * 4;
    ctx.fillStyle = PALETTE.seaDeep;
    ctx.fillRect(Math.max(vx0, SEA_X), vy0, vx1 - Math.max(vx0, SEA_X), vy1 - vy0);
    ctx.fillStyle = PALETTE.sea;
    ctx.fillRect(Math.max(vx0, SEA_X + 6), vy0, vx1 - Math.max(vx0, SEA_X + 6), vy1 - vy0);
    ctx.strokeStyle = 'rgba(190, 224, 240, 0.35)';
    ctx.lineWidth = 2;
    for (let wy = 120; wy < WORLD.height; wy += 160) {
      if (wy < vy0 || wy > vy1) continue;
      ctx.beginPath();
      for (let wx = SEA_X + 20; wx < Math.min(vx1, SEA_X + 520); wx += 40) {
        const wyy = wy + Math.sin(wx * 0.02 + time * 2 + wy) * 5;
        if (wx === SEA_X + 20) ctx.moveTo(wx, wyy); else ctx.lineTo(wx, wyy);
      }
      ctx.stroke();
    }
    // tidal channel: water level rises/falls with the tide
    const tideHigh = state.tideT < 40;
    ctx.fillStyle = tideHigh ? PALETTE.tidal : '#2a3a33';
    ctx.fillRect(TIDAL.x, TIDAL.y, TIDAL.w, TIDAL.h);
    if (!tideHigh) {
      ctx.fillStyle = '#4a4030';
      ctx.fillRect(TIDAL.x, TIDAL.y + TIDAL.h * 0.45, TIDAL.w, TIDAL.h * 0.55);
      text('SURUT', TIDAL.x + TIDAL.w / 2, TIDAL.y + 30, 16, '#e8dcc0', 'center');
    }

    // roads
    ctx.fillStyle = PALETTE.road;
    for (const y of ROADS_H) ctx.fillRect(Math.max(vx0, 0), y - ROAD_HALF, Math.min(vx1, SEA_X) - Math.max(vx0, 0), ROAD_HALF * 2);
    for (const x of ROADS_V) ctx.fillRect(x - ROAD_HALF, Math.max(vy0, 0), ROAD_HALF * 2, Math.min(vy1, WORLD.height) - Math.max(vy0, 0));
    // lane dashes
    ctx.fillStyle = PALETTE.roadLine;
    for (const y of ROADS_H) {
      for (let x = 0; x < SEA_X; x += 90) {
        if (x > vx0 && x < vx1 && y > vy0 && y < vy1) ctx.fillRect(x, y - 3, 44, 6);
      }
    }
    for (const x of ROADS_V) {
      for (let y = 0; y < WORLD.height; y += 90) {
        if (x > vx0 && x < vx1 && y > vy0 && y < vy1) ctx.fillRect(x - 3, y, 6, 44);
      }
    }

    // piers
    for (const pier of PIERS) {
      if (!inView(pier.x, pier.y, pier.w, pier.h)) continue;
      ctx.fillStyle = PALETTE.pier;
      ctx.fillRect(pier.x, pier.y, pier.w, pier.h);
      ctx.strokeStyle = '#3a2f22';
      ctx.lineWidth = 2;
      for (let px = pier.x + 20; px < pier.x + pier.w; px += 40) {
        ctx.beginPath(); ctx.moveTo(px, pier.y); ctx.lineTo(px, pier.y + pier.h); ctx.stroke();
      }
    }

    // fish market stalls
    if (inView(FISH_MARKET.x, FISH_MARKET.y, FISH_MARKET.w, FISH_MARKET.h)) {
      ctx.fillStyle = '#2e2a24';
      ctx.fillRect(FISH_MARKET.x, FISH_MARKET.y, FISH_MARKET.w, FISH_MARKET.h);
      const stallColors = ['#c96a3a', '#3a8a7a', '#b8a03a', '#7a4a8a'];
      for (let i = 0; i < 8; i += 1) {
        const sx = FISH_MARKET.x + 16 + (i % 4) * 72;
        const sy = FISH_MARKET.y + 16 + Math.floor(i / 4) * 120;
        ctx.fillStyle = stallColors[i % 4];
        ctx.fillRect(sx, sy, 56, 40);
        ctx.fillStyle = '#e8dcc0';
        ctx.fillRect(sx + 8, sy + 12, 40, 16);
      }
      text('PASAR IKAN', FISH_MARKET.x + FISH_MARKET.w / 2, FISH_MARKET.y + FISH_MARKET.h - 12, 18, PALETTE.text, 'center');
    }

    // buildings
    for (const b of BUILDINGS) {
      if (!inView(b.x, b.y, b.w, b.h)) continue;
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(b.x, b.y, b.w, 14);
      ctx.fillStyle = '#2a2118';
      ctx.fillRect(b.x + b.w / 2 - 24, b.y + b.h - 26, 48, 26); // door
      text(b.label, b.x + b.w / 2, b.y + b.h / 2, 15, 'rgba(244,234,216,0.75)', 'center');
    }

    // container yard ground + containers
    for (const yard of YARDS) {
      if (!inView(yard.x, yard.y, yard.w, yard.h)) continue;
      ctx.fillStyle = '#33291f';
      ctx.fillRect(yard.x, yard.y, yard.w, yard.h);
    }
    for (const c of state.containers) {
      if (!inView(c.x, c.y, c.w, c.h)) continue;
      ctx.fillStyle = c.color;
      ctx.fillRect(c.x, c.y, c.w, c.h);
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 2;
      for (let rx = c.x + 14; rx < c.x + c.w; rx += 16) {
        ctx.beginPath(); ctx.moveTo(rx, c.y + 4); ctx.lineTo(rx, c.y + c.h - 4); ctx.stroke();
      }
      if (c.stacked) {
        ctx.fillStyle = 'rgba(255,255,255,0.14)';
        ctx.fillRect(c.x + 6, c.y + 6, c.w - 12, 12);
      }
      if (c.gold) {
        const pulse = 0.6 + 0.4 * Math.sin(time * 4);
        ctx.strokeStyle = `rgba(242, 201, 76, ${pulse})`;
        ctx.lineWidth = 4;
        ctx.strokeRect(c.x - 3, c.y - 3, c.w + 6, c.h + 6);
        text('★ EMAS ★', c.x + c.w / 2, c.y + c.h / 2 + 6, 16, '#1a1408', 'center');
      }
    }

    // cranes: tall silhouettes over the yard
    for (const crane of CRANES) {
      if (!inView(crane.x - 120, crane.y - 160, 260, 220)) continue;
      ctx.strokeStyle = '#c96a2a';
      ctx.lineWidth = 8;
      ctx.beginPath(); ctx.moveTo(crane.x - 90, crane.y - 150); ctx.lineTo(crane.x + 110, crane.y - 150); ctx.stroke();
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(crane.x - 30, crane.y + 30); ctx.lineTo(crane.x - 30, crane.y - 150); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(crane.x + 30, crane.y + 30); ctx.lineTo(crane.x + 30, crane.y - 150); ctx.stroke();
      // hook swaying slowly
      const hx = crane.x + 40 + Math.sin(time * 0.5 + crane.x) * 26;
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#e8dcc0';
      ctx.beginPath(); ctx.moveTo(crane.x + 40, crane.y - 150); ctx.lineTo(hx, crane.y - 90); ctx.stroke();
      ctx.fillStyle = '#f2c94c';
      ctx.fillRect(hx - 8, crane.y - 90, 16, 14);
      ctx.fillStyle = '#2a2118';
      ctx.fillRect(crane.x - 30, crane.y - 30, 60, 60);
    }

    // lighthouse + rotating beam
    if (inView(LIGHTHOUSE.x - 200, LIGHTHOUSE.y - 200, 400, 400)) {
      const beamAngle = time * 0.6;
      const grad = ctx.createRadialGradient(LIGHTHOUSE.x, LIGHTHOUSE.y, 10, LIGHTHOUSE.x, LIGHTHOUSE.y, 420);
      grad.addColorStop(0, 'rgba(255, 240, 180, 0.28)');
      grad.addColorStop(1, 'rgba(255, 240, 180, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(LIGHTHOUSE.x, LIGHTHOUSE.y);
      ctx.arc(LIGHTHOUSE.x, LIGHTHOUSE.y, 420, beamAngle - 0.12, beamAngle + 0.12);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#e8e4da';
      ctx.beginPath(); ctx.arc(LIGHTHOUSE.x, LIGHTHOUSE.y, 26, 0, TAU); ctx.fill();
      ctx.fillStyle = '#c0392b';
      ctx.beginPath(); ctx.arc(LIGHTHOUSE.x, LIGHTHOUSE.y, 26, 0, TAU); ctx.fill();
      ctx.fillStyle = '#e8e4da';
      ctx.beginPath(); ctx.arc(LIGHTHOUSE.x, LIGHTHOUSE.y, 16, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffd76a';
      ctx.beginPath(); ctx.arc(LIGHTHOUSE.x, LIGHTHOUSE.y, 9 + Math.sin(time * 3) * 2, 0, TAU); ctx.fill();
    }

    // yacht (mission 6)
    if (inView(YACHT.x, YACHT.y, YACHT.w, YACHT.h)) {
      ctx.fillStyle = '#e8e4da';
      ctx.beginPath();
      ctx.ellipse(YACHT.x + YACHT.w / 2, YACHT.y + YACHT.h / 2, YACHT.w / 2, YACHT.h / 2, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#2a4a6a';
      ctx.fillRect(YACHT.x + 24, YACHT.y + 6, 60, 16);
      text('KAPAL PESIAR', YACHT.x + YACHT.w / 2, YACHT.y - 8, 14, PALETTE.text, 'center');
      const pulse = 0.6 + 0.4 * Math.sin(time * 4);
      ctx.strokeStyle = `rgba(242, 201, 76, ${pulse})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(LEDGER_POINT.x, LEDGER_POINT.y, 16, 0, TAU); ctx.stroke();
    }

    // tire tracks / wakes
    for (const t of state.tracks) {
      ctx.save();
      ctx.globalAlpha = Math.min(0.5, t.life * 0.4);
      ctx.translate(t.x, t.y);
      ctx.rotate(t.angle);
      ctx.fillStyle = t.kind === 'boat' ? '#bfe0f0' : '#15131a';
      ctx.fillRect(-14, -3, 28, 6);
      ctx.restore();
    }
    ctx.globalAlpha = 1;

    drawVehicles(state, time);
    drawPeds(state);
    drawEnemies(state, time);
    drawBullets(state);
    drawParticles(state);

    // mission target marker
    if (state.target) {
      const t = state.target;
      const bob = Math.sin(time * 5) * 8;
      ctx.strokeStyle = '#f2c94c';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(t.x, t.y + bob, 26, 0, TAU); ctx.stroke();
      ctx.fillStyle = '#f2c94c';
      ctx.beginPath(); ctx.moveTo(t.x, t.y + bob + 34); ctx.lineTo(t.x - 9, t.y + bob + 18); ctx.lineTo(t.x + 9, t.y + bob + 18); ctx.closePath(); ctx.fill();
      text(t.label, t.x, t.y + bob - 34, 16, '#f2c94c', 'center');
    }

    // sunset vignette at the edges of the view
    const vg = ctx.createRadialGradient(view.camX, view.camY, 300, view.camX, view.camY, 900);
    vg.addColorStop(0, 'rgba(232, 114, 42, 0)');
    vg.addColorStop(1, 'rgba(232, 114, 42, 0.16)');
    ctx.fillStyle = vg;
    ctx.fillRect(vx0, vy0, vx1 - vx0, vy1 - vy0);
    void wave;
  }

  function drawVehicleShape(v, time) {
    const ctx = context;
    ctx.save();
    ctx.translate(v.x, v.y);
    ctx.rotate(v.angle);
    if (v.kind === 'boat') {
      ctx.fillStyle = v.color;
      ctx.beginPath();
      ctx.moveTo(34, 0); ctx.lineTo(18, -16); ctx.lineTo(-30, -14); ctx.lineTo(-34, 0); ctx.lineTo(-30, 14); ctx.lineTo(18, 16);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(-14, -8, 26, 16);
      ctx.fillStyle = '#f2c94c';
      ctx.fillRect(20, -3, 8, 6);
    } else {
      const w = v.kind === 'truck' ? 64 : 52;
      const h = v.kind === 'truck' ? 30 : 26;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(-w / 2 + 4, -h / 2 + 4, w, h);
      ctx.fillStyle = v.color;
      ctx.fillRect(-w / 2, -h / 2, w, h);
      if (v.kind === 'truck') {
        ctx.fillStyle = '#3a332c';
        ctx.fillRect(-w / 2, -h / 2, 18, h);
        ctx.fillStyle = '#c8a03a';
        ctx.fillRect(w / 2 - 22, -h / 2 + 4, 16, h - 8);
      } else {
        ctx.fillStyle = '#1c2733';
        ctx.fillRect(-6, -h / 2 + 4, 16, h - 8);
      }
      ctx.fillStyle = '#ffe9a8';
      ctx.fillRect(w / 2 - 4, -h / 2 + 3, 3, 6);
      ctx.fillRect(w / 2 - 4, h / 2 - 9, 3, 6);
      if (v.kind === 'police') {
        const blink = Math.sin(time * 12) > 0;
        ctx.fillStyle = blink ? '#e5534b' : '#2f6fd0';
        ctx.fillRect(-8, -h / 2 - 4, 16, 6);
        ctx.fillStyle = '#e8e4da';
        text('POLISI', 0, -h / 2 - 8, 10, '#e8e4da', 'center');
      }
    }
    ctx.restore();
  }

  function drawVehicles(state, time) {
    const ctx = context;
    for (const v of state.vehicles) {
      if (v.sunk) continue;
      if (v.driver === 'player') continue; // drawn with the player
      drawVehicleShape(v, time);
      if (v.stealable && v.parked && !v.driver) {
        const pulse = 0.5 + 0.5 * Math.sin(time * 4 + v.id);
        ctx.strokeStyle = `rgba(242, 201, 76, ${pulse})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(v.x, v.y, 34, 0, TAU); ctx.stroke();
      }
    }
    // player vehicle
    const p = state.player;
    if (p.vehicle) drawVehicleShape(p.vehicle, time);
  }

  function drawPeds(state) {
    const ctx = context;
    for (const ped of state.peds) {
      ctx.fillStyle = ped.color;
      ctx.beginPath(); ctx.arc(ped.x, ped.y, 9, 0, TAU); ctx.fill();
      ctx.fillStyle = '#2b2b33';
      ctx.beginPath(); ctx.arc(ped.x + Math.cos(ped.angle) * 4, ped.y + Math.sin(ped.angle) * 4, 4, 0, TAU); ctx.fill();
      if (ped.flee > 0) text('!', ped.x, ped.y - 14, 16, '#e5534b', 'center');
    }
  }

  function drawEnemies(state, time) {
    const ctx = context;
    for (const e of state.enemies) {
      if (e.dead) continue;
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.fillStyle = e.hitFlash > 0 ? '#ffffff' : (e.kind === 'cop' ? '#2f6fd0' : PALETTE.enemy);
      ctx.beginPath(); ctx.arc(0, 0, 13, 0, TAU); ctx.fill();
      ctx.rotate(e.angle);
      ctx.fillStyle = '#1c1c22';
      ctx.fillRect(8, -3, 18, 6);
      ctx.restore();
      // hp bar
      const maxHp = e.kind === 'rival' ? 60 : e.kind === 'guard' ? 50 : 40;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(e.x - 16, e.y - 24, 32, 5);
      ctx.fillStyle = '#e5534b';
      ctx.fillRect(e.x - 16, e.y - 24, 32 * Math.max(0, e.hp / maxHp), 5);
      if (e.kind === 'cop') text('POLISI', e.x, e.y - 28, 11, '#9ab8e8', 'center');
    }
  }

  function drawBullets(state) {
    const ctx = context;
    for (const b of state.bullets) {
      ctx.strokeStyle = b.fromPlayer ? '#ffd76a' : '#ff8a7a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }

  function drawParticles(state) {
    const ctx = context;
    for (const pt of state.particles) {
      ctx.globalAlpha = Math.max(0, pt.life / pt.max);
      ctx.fillStyle = pt.color;
      ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
    }
    ctx.globalAlpha = 1;
  }

  function drawPlayer(state, aimAngle) {
    const ctx = context;
    const p = state.player;
    if (p.vehicle) {
      // aim line from the vehicle
      ctx.strokeStyle = 'rgba(242, 201, 76, 0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + Math.cos(aimAngle) * 70, p.y + Math.sin(aimAngle) * 70); ctx.stroke();
      return;
    }
    if (p.invulnerable > 0 && Math.floor(p.invulnerable * 12) % 2 === 0) return; // blink
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    // body: ex-dockworker in a yellow hi-vis jacket
    ctx.fillStyle = PALETTE.player;
    ctx.beginPath(); ctx.arc(0, 0, 14, 0, TAU); ctx.fill();
    ctx.fillStyle = '#2b2b33';
    ctx.fillRect(6, -4, 16, 8); // gun / arm toward aim
    ctx.fillStyle = '#e8dcc0';
    ctx.beginPath(); ctx.arc(2, 0, 6, 0, TAU); ctx.fill();
    ctx.restore();
    if (p.meleeAnim > 0) {
      ctx.strokeStyle = 'rgba(232, 220, 192, 0.8)';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(p.x, p.y, 40, aimAngle - 0.9, aimAngle + 0.9); ctx.stroke();
    }
    // aim reticle
    const rx = p.x + Math.cos(aimAngle) * 46;
    const ry = p.y + Math.sin(aimAngle) * 46;
    ctx.strokeStyle = '#f2c94c';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(rx, ry, 8, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(rx - 12, ry); ctx.lineTo(rx - 5, ry); ctx.moveTo(rx + 5, ry); ctx.lineTo(rx + 12, ry); ctx.moveTo(rx, ry - 12); ctx.lineTo(rx, ry - 5); ctx.moveTo(rx, ry + 5); ctx.lineTo(rx, ry + 12); ctx.stroke();
  }

  function drawHud(state, screen) {
    const ctx = context;
    const p = state.player;
    const W = canvas.width;
    const H = canvas.height;
    // top-left: money + health
    ctx.fillStyle = PALETTE.panel;
    ctx.fillRect(14, 12, 250, 86);
    text(`$ ${p.money.toLocaleString('en-US')}`, 28, 42, 26, '#7ee787', 'left');
    text('UTANG LUNAS SAAT $10.000', 28, 62, 11, PALETTE.muted, 'left');
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(28, 70, 200, 12);
    ctx.fillStyle = p.health > 40 ? '#7ee787' : '#e5534b';
    ctx.fillRect(28, 70, 200 * Math.max(0, p.health / 100), 12);
    text('HP', 232, 82, 11, PALETTE.text, 'right');
    // wanted stars, top centre
    const stars = '★★★★★';
    text('WANTED', W / 2 - 90, 40, 18, PALETTE.muted, 'left');
    for (let i = 0; i < 5; i += 1) {
      text('★', W / 2 - 10 + i * 26, 42, 26, i < p.wanted ? '#e5534b' : 'rgba(255,255,255,0.18)', 'left');
    }
    // tide indicator
    const tideHigh = state.tideT < 40;
    const secs = Math.ceil(tideHigh ? 40 - state.tideT : 60 - state.tideT);
    ctx.fillStyle = PALETTE.panel;
    ctx.fillRect(14, 106, 250, 34);
    text(tideHigh ? `▲ PASANG ${secs} dtk` : `▼ SURUT ${secs} dtk — kanal dangkal`, 28, 130, 15, tideHigh ? '#7ec8e8' : '#e8a04c', 'left');
    // mission banner
    const mission = MISSIONS[state.mission];
    ctx.fillStyle = PALETTE.panel;
    ctx.fillRect(14, H - 118, 560, 104);
    text(`MISI ${state.mission + 1}/6 — ${mission.name}  (+$${mission.reward})`, 28, H - 88, 18, '#f2c94c', 'left');
    text(state.missionText, 28, H - 60, 15, PALETTE.text, 'left');
    if (state.missionTimer > 0 && state.missionStage === 1 && state.mission === 0) {
      text(`SISA WAKTU: ${Math.ceil(state.missionTimer)} dtk`, 28, H - 32, 15, '#e5534b', 'left');
    }
    // speed when driving
    if (p.vehicle) {
      text(`${Math.round(Math.abs(p.vehicle.speed) * 0.36)} km/j`, W - 210, H - 40, 22, PALETTE.text, 'left');
      text(p.vehicle.kind === 'boat' ? 'SPEEDBOAT' : p.vehicle.kind === 'truck' ? 'TRUK' : 'MOBIL', W - 210, H - 66, 14, PALETTE.muted, 'left');
    }
    // transient message, centred below the wanted stars
    if (state.messageT > 0 && state.message) {
      ctx.fillStyle = PALETTE.panel;
      const mw = Math.min(720, 40 + state.message.length * 8.5);
      ctx.fillRect(W / 2 - mw / 2, 150, mw, 40);
      text(state.message, W / 2, 178, 17, PALETTE.text, 'center');
    }
    // prompt (E …)
    // drawn by main via drawPrompt; kept here for shot mode consistency
    drawMinimap(state);
  }

  function drawPrompt(promptText) {
    if (!promptText) return;
    const ctx = context;
    const W = canvas.width;
    const H = canvas.height;
    ctx.fillStyle = PALETTE.panel;
    const pw = 40 + promptText.length * 8.5;
    ctx.fillRect(W / 2 - pw / 2, H - 168, pw, 38);
    text(promptText, W / 2, H - 142, 17, '#f2c94c', 'center');
  }

  function drawMinimap(state) {
    const ctx = context;
    const mw = 190;
    const mh = 142;
    const mx = canvas.width - mw - 14;
    const my = 12;
    const sx = mw / WORLD.width;
    const sy = mh / WORLD.height;
    ctx.fillStyle = 'rgba(10, 10, 18, 0.85)';
    ctx.fillRect(mx, my, mw, mh);
    ctx.fillStyle = PALETTE.sea;
    ctx.fillRect(mx + SEA_X * sx, my, (WORLD.width - SEA_X) * sx, mh);
    ctx.fillStyle = '#4a4238';
    for (const b of BUILDINGS) ctx.fillRect(mx + b.x * sx, my + b.y * sy, Math.max(2, b.w * sx), Math.max(2, b.h * sy));
    ctx.fillStyle = '#8a5a2b';
    for (const yard of YARDS) ctx.fillRect(mx + yard.x * sx, my + yard.y * sy, yard.w * sx, yard.h * sy);
    ctx.fillStyle = '#f2c94c';
    ctx.fillRect(mx + GOLD_CONTAINER.x * sx - 2, my + GOLD_CONTAINER.y * sy - 2, 5, 5);
    if (state.target) {
      const pulse = 0.6 + 0.4 * Math.sin(performance.now() / 200);
      ctx.fillStyle = `rgba(242, 201, 76, ${pulse})`;
      ctx.beginPath(); ctx.arc(mx + state.target.x * sx, my + state.target.y * sy, 5, 0, TAU); ctx.fill();
    }
    // police dots
    ctx.fillStyle = '#e5534b';
    for (const pol of state.police) {
      const e = pol.vehicle || pol.foot;
      if (e) ctx.fillRect(mx + e.x * sx - 2, my + e.y * sy - 2, 4, 4);
    }
    // player arrow
    const p = state.player;
    ctx.save();
    ctx.translate(mx + p.x * sx, my + p.y * sy);
    ctx.rotate(p.angle);
    ctx.fillStyle = '#7ee787';
    ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-5, -5); ctx.lineTo(-5, 5); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(244, 234, 216, 0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(mx, my, mw, mh);
    text('PORT MERIDIAN', mx + 6, my + mh - 6, 11, PALETTE.muted, 'left');
  }

  function drawPanel(title, lines, prompt, accent) {
    const ctx = context;
    const W = canvas.width;
    const H = canvas.height;
    ctx.fillStyle = 'rgba(8, 6, 14, 0.72)';
    ctx.fillRect(0, 0, W, H);
    const pw = 680;
    const ph = 150 + lines.length * 34;
    const px = (W - pw) / 2;
    const py = (H - ph) / 2;
    ctx.fillStyle = PALETTE.panel;
    ctx.fillRect(px, py, pw, ph);
    ctx.strokeStyle = accent || '#f2c94c';
    ctx.lineWidth = 3;
    ctx.strokeRect(px, py, pw, ph);
    text(title, W / 2, py + 62, 44, accent || '#f2c94c', 'center');
    for (let i = 0; i < lines.length; i += 1) {
      text(lines[i], W / 2, py + 112 + i * 34, 19, PALETTE.text, 'center');
    }
    text(prompt, W / 2, py + ph - 34, 20, '#f2c94c', 'center');
  }

  function draw(state, screen, aimAngle, promptTextValue, time, dt) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    updateCamera(state, dt || 0.016);
    context.setTransform(view.zoom, 0, 0, view.zoom, canvas.width / 2 - view.camX * view.zoom, canvas.height / 2 - view.camY * view.zoom);
    drawWorld(state, time);
    drawPlayer(state, aimAngle);
    context.setTransform(1, 0, 0, 1, 0, 0);
    if (screen === SCREEN_TITLE) {
      drawPanel('DOCKLINE', [
        'Port Meridian — kota pelabuhan. Kamu bekas buruh pelabuhan yang dijebak,',
        'dipecat, dan dipaksa bekerja untuk bos pelabuhan demi melunasi utang $10.000.',
        'Curi truk kontainer, rampok gudang, kabur lewat laut dengan speedboat.',
        '',
        'WASD jalan • E masuk/keluar kendaraan • Mouse bidik, klik tembak • F pukul',
        'Wanted 1–5 bintang • Sembunyi di labirin kontainer biar polisi kehilangan jejak',
      ], 'Tekan Spasi / klik untuk mulai  •  Lanjutkan: simpan otomatis (localStorage)', '#f2c94c');
      return;
    }
    drawHud(state, screen);
    drawPrompt(promptTextValue);
    if (screen === SCREEN_PAUSED) {
      drawPanel('JEDA', ['Port Meridian menunggu. Utang tidak lunas sendiri.'], 'Tekan P untuk lanjut', '#7ec8e8');
    } else if (screen === SCREEN_OVER) {
      drawPanel('TERTANGKAP!', [
        `Bos pelabuhan memotong gajimu $200. Misi ${state.mission + 1} tetap berjalan.`,
        `Uang sekarang: $${state.player.money.toLocaleString('en-US')}`,
      ], 'Tekan Spasi / klik untuk bangkit lagi', '#e5534b');
    } else if (screen === SCREEN_WIN) {
      drawPanel('UTANG LUNAS — KAMU BEBAS!', [
        'Buku catatan utang sudah di tanganmu. Enam misi selesai.',
        `Total uang: $${state.player.money.toLocaleString('en-US')}  •  Kendaraan dicuri: ${state.stats.stolen}  •  Musuh dikalahkan: ${state.stats.kos}`,
        'Port Meridian akhirnya milikmu, bukan milik bos pelabuhan.',
      ], 'Tekan Spasi / klik untuk main lagi dari awal', '#7ee787');
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, screenToWorld, view };
}
