// AMOEBA_BRAIN.JS
export const AmoebaState = Object.freeze({
  IDLE: 0,
  WANDER: 1,
  FLEE: 2,
});

export function amoebaBrainUpdate(a, dt, env) {
  a.stateTime += dt;
  a.speed = Math.hypot(a.vx, a.vy);

  const targetHeading = Math.atan2(a.vy, a.vx);
  const turn = 1 - Math.exp(-12 * dt);
  a.heading = lerpAngle(a.heading ?? targetHeading, targetHeading, turn);

  const px = env.pointer.x;
  const py = env.pointer.y;

  const dxp = a.x - px;
  const dyp = a.y - py;
  const dist2p = dxp * dxp + dyp * dyp;

  const fleeRadius = (a.r + 40);
  const fleeRadius2 = fleeRadius * fleeRadius;

  // Trigger flee
  if (env.pointer.down && dist2p < fleeRadius2 && a.state !== AmoebaState.FLEE) {
    enter(a, AmoebaState.FLEE);
  }

  switch (a.state) {
    case AmoebaState.IDLE: {
      dampVelocity(a, dt);
      if (a.stateTime > 0.8) {
        pickTarget(a, env);
        enter(a, AmoebaState.WANDER);
      }
      break;
    }

    case AmoebaState.WANDER: {
      seekTarget(a, dt);
      wanderWiggle(a, dt);
      keepInBounds(a, env, dt);

      const dxt = a.tx - a.x;
      const dyt = a.ty - a.y;
      if ((dxt * dxt + dyt * dyt) < 20 * 20) {
        enter(a, AmoebaState.IDLE);
      }
      break;
    }

    case AmoebaState.FLEE: {
    const d = Math.max(1e-4, Math.sqrt(dist2p));
    const nx = dxp / d;
    const ny = dyp / d;

    // 0..1 where 1 is "very close"
    const t = Math.max(0, 1 - d / fleeRadius);

    const accel = 120 + 260 * t; // ramp up when close
    a.vx += nx * accel * dt;
    a.vy += ny * accel * dt;

    limitSpeed(a, 140);
    keepInBounds(a, env, dt);

    if (a.stateTime > 0.5 && !env.pointer.down) {
      pickTarget(a, env);
      enter(a, AmoebaState.WANDER);
    }
    break;
}

  }

    const maxSpeed =
    a.state === AmoebaState.FLEE ? 140 :
    a.state === AmoebaState.WANDER ? 90 : 60;

  // Avoid Others
  avoidOthers(a, env, dt, maxSpeed);

  // integrate motion
  a.x += a.vx * dt;
  a.y += a.vy * dt;
}

function enter(a, s) {
  a.state = s;
  a.stateTime = 0;
}

function pickTarget(a, env) {
  a.targetN = (a.targetN || 0) + 1;

  const w = env.view.w, h = env.view.h, r = a.r;

  // deterministic pseudo-random-ish using sin; unique per agent and per pick
  const u = hash01(a.id * 1013 + a.targetN * 9176);
  const v = hash01(a.id * 733 + a.targetN * 31337);

  a.tx = r + u * (w - 2 * r);
  a.ty = r + v * (h - 2 * r);
}

function hash01(n) {
  // deterministic 0..1 "hash"
  const x = Math.sin(n) * 43758.5453123;
  return x - Math.floor(x);
}


function seekTarget(a, dt) {
  const dx = a.tx - a.x;
  const dy = a.ty - a.y;
  const d = Math.max(1e-4, Math.sqrt(dx * dx + dy * dy));

  const maxSpeed = 90;
  const slowRadius = 120;

  // desired speed ramps down near the target
  const desiredSpeed = maxSpeed * Math.min(1, d / slowRadius);

  // desired velocity
  const dvx = (dx / d) * desiredSpeed;
  const dvy = (dy / d) * desiredSpeed;

  // steering: move current velocity toward desired velocity
  const steer = 6.0; // responsiveness
  a.vx += (dvx - a.vx) * (1 - Math.exp(-steer * dt));
  a.vy += (dvy - a.vy) * (1 - Math.exp(-steer * dt));

  limitSpeed(a, maxSpeed);
}


function dampVelocity(a, dt) {
  const k = Math.exp(-6 * dt);
  a.vx *= k;
  a.vy *= k;
}

function limitSpeed(a, max) {
  const s2 = a.vx * a.vx + a.vy * a.vy;
  const m2 = max * max;
  if (s2 > m2) {
    const s = Math.sqrt(s2);
    const f = max / s;
    a.vx *= f;
    a.vy *= f;
  }
}

function keepInBounds(a, env, dt) {
  const r = a.r;
  const w = env.view.w;
  const h = env.view.h;

  // soft push back in if near edges
  if (a.x < r) a.vx += (r - a.x) * 10;
  if (a.x > w - r) a.vx -= (a.x - (w - r)) * dt;
  if (a.y < r) a.vy += (r - a.y) * 10;
  if (a.y > h - r) a.vy -= (a.y - (h - r)) * dt;
}

function avoidOthers(a, env, dt, maxSpeed) {
  const agents = env.agents;
  if (!agents) return;

  const desired = a.r * 20;
  const desired2 = desired * desired;

  let fx = 0, fy = 0, count = 0;

  for (let i = 0; i < agents.length; i++) {
    const b = agents[i];
    if (b === a) continue;

    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const d2 = dx * dx + dy * dy;

    if (d2 > 1e-6 && d2 < desired2) {
      const d = Math.sqrt(d2);
      const w = (desired - d) / desired;
      fx += (dx / d) * w;
      fy += (dy / d) * w;
      count++;
    }
  }

  if (count > 0) {
    const strength = 220;
    a.vx += fx * strength * dt;
    a.vy += fy * strength * dt;
    limitSpeed(a, maxSpeed);
  }
}

function wanderWiggle(a, dt) {
  a.wanderPhase = (a.wanderPhase ?? (a.id * 10.0)) + dt * 3.0;
  const wig = 400; // px/s^2-ish
  const sx = Math.sin(a.wanderPhase);
  const cx = Math.cos(a.wanderPhase);

  // perpendicular to current velocity (or heading)
  const hx = Math.cos(a.heading);
  const hy = Math.sin(a.heading);
  const px = -hy, py = hx;

  a.vx += px * sx * wig * dt;
  a.vy += py * cx * wig * dt;
}

function lerpAngle(a0, a1, t) {
  let d = a1 - a0;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a0 + d * t;
}


