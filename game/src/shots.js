// The screenshot scenes behind ?shot=start|play|boat|end. Each one plays the
// real rules forward from a fresh world for a fixed number of steps, steered
// by a simple autopilot, so the frame is what a short game really looks like
// and the same seed always gives the same frame.
import { STEP } from './config.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';

// Drive forward along a heading, steering gently toward the target.
function driveCtl(world, targetX, targetY) {
  const p = world.player;
  const v = p.vehicle;
  if (!v) return { move: { x: 0, y: 0 }, aimAngle: 0, shoot: false, melee: false, interact: false };
  const want = Math.atan2(targetY - v.y, targetX - v.x);
  let diff = want - v.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return {
    move: { x: diff > 0.25 ? 1 : diff < -0.25 ? -1 : 0, y: -1 },
    aimAngle: v.angle, shoot: false, melee: false, interact: false,
  };
}

function walkCtl(world, targetX, targetY) {
  const p = world.player;
  const dx = targetX - p.x;
  const dy = targetY - p.y;
  const len = Math.hypot(dx, dy) || 1;
  return {
    move: { x: dx / len, y: dy / len },
    aimAngle: Math.atan2(dy, dx), shoot: false, melee: false, interact: false,
  };
}

/**
 * Set `world` to the named scene and return the screen to draw over it.
 * start: title over the docks at dusk. play: driving the stolen truck
 * through the container yard with police behind. boat: speedboat escape
 * across the tidal channel at high tide. end: the final escape — win panel.
 */
export function stageShot(name, world) {
  const st = world.state;
  if (name === 'play') {
    // player in the mission-1 truck, wanted 2, police chasing, on the road
    // south of the container yard
    const truck = st.vehicles.find((v) => v.kind === 'truck' && v.x > 1700 && v.x < 2000);
    world._enterVehicle(truck);
    truck.x = 1700;
    truck.y = 1000;
    truck.angle = Math.PI;
    truck.speed = 240;
    world.player.x = truck.x;
    world.player.y = truck.y;
    world._addWanted(2);
    const cop = world._spawnPoliceCar();
    cop.x = 2000; // chase starts right behind the truck, on the same road
    cop.y = 1000;
    cop.angle = Math.PI;
    world._startMission(0);
    st.missionStage = 1;
    st.missionTimer = 132;
    world._setObjective('Antar truk ke titik drop di selatan sebelum patroli datang!');
    world._setTarget(480, 2100, 'DROP');
    world.player.money = 800;
    for (let i = 0; i < 2.5 * 60; i += 1) {
      world.step(STEP, driveCtl(world, 300, 1000));
    }
    return { screen: SCREEN_PLAY };
  }
  if (name === 'boat') {
    world._startMission(2);
    st.missionStage = 1;
    world._setObjective('Bawa speedboat ke laut lepas (tanda biru).');
    world._setTarget(3050, 1400, 'LAUT LEPAS');
    const boat = st.vehicles.find((v) => v.kind === 'boat' && v.x > 2500 && v.x < 2600);
    world._enterVehicle(boat);
    world._addWanted(3);
    world._spawnPatrolBoat();
    world.player.money = 3300;
    for (let i = 0; i < 9 * 60; i += 1) {
      world.step(STEP, driveCtl(world, 3050, 1400));
    }
    return { screen: SCREEN_PLAY };
  }
  if (name === 'end') {
    world.player.money = 10500;
    world._startMission(5);
    st.missionStage = 3;
    world._setObjective('Kabur ke laut lepas — jangan sampai tertangkap!');
    world._setTarget(3100, 600, 'BEBAS');
    const boat = st.vehicles.find((v) => v.kind === 'boat' && v.y > 800 && v.y < 1000);
    world._enterVehicle(boat);
    boat.x = 2900;
    boat.y = 620;
    boat.angle = Math.PI / 4;
    boat.speed = 300;
    world.player.x = boat.x;
    world.player.y = boat.y;
    world._addWanted(4);
    world._spawnPatrolBoat();
    for (let i = 0; i < 6 * 60; i += 1) {
      world.step(STEP, driveCtl(world, 3100, 600));
    }
    st.winT = 1; // show the win panel over the escape
    return { screen: SCREEN_WIN };
  }
  // start (default): title screen over the port, player on foot by the docks
  world.player.x = 2400;
  world.player.y = 900;
  world.player.angle = 0.4;
  for (let i = 0; i < 5 * 60; i += 1) {
    world.step(STEP, walkCtl(world, 2500, 900));
  }
  world.player.x = 2400;
  world.player.y = 900;
  return { screen: SCREEN_TITLE };
}
