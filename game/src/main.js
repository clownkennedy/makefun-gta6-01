// DOCKLINE boot and the one loop: input is read every frame, the world
// advances in fixed 1/60 s steps, and the renderer paints what is there.
// Screens: title, play, paused, busted (over), win.
//
// ?seed=N fixes the random layout. ?shot=start|play|boat|end (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { SAVE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_BUSTED, EVENT_MISSION, EVENT_WIN } from './world.js';
import { ACTION_CONFIRM, ACTION_INTERACT, ACTION_MELEE, ACTION_PAUSE, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const audio = createAudio();
const world = createWorld(createRandom(seed), audio);
const renderer = createRenderer(canvas);

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  let time = 0;
  function paint() {
    time += 1 / 60;
    renderer.draw(world.state, scene.screen, 0, '', time, 1 / 60);
    painted += 1;
    // paint many frames so the camera fully converges on the staged scene
    if (painted < 60) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let accumulator = 0;
  let last = performance.now();
  let time = 0;
  let hasSave = world.hasSave();
  let pendingInteract = false;
  let pendingMelee = false;

  function announce(message) {
    status.textContent = message;
  }

  function startGame(fresh) {
    audio.unlock();
    audio.startEngine();
    if (fresh) {
      try { window.localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
      world.reset(false);
    } else if (hasSave) {
      world.reset(true);
      world.loadGame();
    } else {
      world.reset(false);
    }
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Playing DOCKLINE. Follow the yellow marker.');
  }

  function endBusted() {
    screen = SCREEN_OVER;
    world.player.money = Math.max(0, world.player.money - 200);
    world.saveGame();
    announce('Busted. You lost $200.');
  }

  function endWin() {
    screen = SCREEN_WIN;
    world.saveGame();
    announce('Debt paid. You are free.');
  }

  function handleActions() {
    const actions = input.takeActions();
    // stash interact/melee for the step loop below; confirm/pause act here
    pendingInteract = pendingInteract || !!(actions & ACTION_INTERACT);
    pendingMelee = pendingMelee || !!(actions & ACTION_MELEE);
    if (actions & ACTION_CONFIRM) audio.unlock();
    if (screen === SCREEN_TITLE && (actions & ACTION_CONFIRM)) {
      // Space/click starts; Enter with a save continues — both just start,
      // loadGame picks up the save when one exists.
      startGame(false);
    } else if (screen === SCREEN_OVER && (actions & ACTION_CONFIRM)) {
      world.reset(true, true);
      screen = SCREEN_PLAY;
      announce('Back on the streets of Port Meridian.');
    } else if (screen === SCREEN_WIN && (actions & ACTION_CONFIRM)) {
      startGame(true);
    } else if (screen === SCREEN_PLAY && (actions & ACTION_PAUSE)) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (screen === SCREEN_PAUSED && (actions & (ACTION_PAUSE | ACTION_CONFIRM))) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
  }

  function buildControls() {
    const move = input.move();
    const mouse = input.mouse();
    const aimWorld = renderer.screenToWorld(mouse.x, mouse.y);
    const p = world.player;
    const aimAngle = Math.atan2(aimWorld.y - p.y, aimWorld.x - p.x);
    // mouse click also fires (held): input.mouse().down
    return {
      move,
      aimAngle,
      shoot: mouse.down && !p.vehicle,
      melee: false,
      interact: false,
    };
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dtReal = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    time += dtReal;
    handleActions();
    if (screen === SCREEN_TITLE) {
      // ambient port life behind the title panel
      const idle = { move: { x: 0, y: 0 }, aimAngle: 0, shoot: false, melee: false, interact: false };
      while (accumulator < dtReal) { world.step(STEP, idle); accumulator += STEP; }
      accumulator = 0;
      renderer.draw(world.state, screen, 0, '', time, dtReal);
      return;
    }
    if (screen !== SCREEN_PLAY) {
      renderer.draw(world.state, screen, 0, '', time, dtReal);
      return;
    }
    accumulator += dtReal;
    while (accumulator >= STEP) {
      const ctl = buildControls();
      ctl.interact = pendingInteract;
      ctl.melee = pendingMelee;
      pendingInteract = false;
      pendingMelee = false;
      const events = world.step(STEP, ctl);
      if (events & EVENT_BUSTED && world.state.bustedT > 1.2) endBusted();
      else if (events & EVENT_WIN && world.state.winT > 1.5) endWin();
      if (events & EVENT_MISSION) announce(world.state.missionText);
      accumulator -= STEP;
    }
    const prompt = world.promptText();
    const aimWorld = renderer.screenToWorld(input.mouse().x, input.mouse().y);
    const p = world.player;
    const aimAngle = Math.atan2(aimWorld.y - p.y, aimWorld.x - p.x);
    renderer.draw(world.state, screen, aimAngle, prompt, time, dtReal);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('DOCKLINE. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
