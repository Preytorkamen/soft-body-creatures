export const AmoebaState = Object.freeze({
  IDLE: 0,
  WANDER: 1,
  FLEE: 2,
});

export function amoebaBrainUpdate(a, dt, env) {
  a.stateTime += dt;

  // Ensure heading exists (prevents NaN in wanderWiggle/render)
  if (a.heading == null) a.heading = 0;

  // pointer
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

  // Avoid others
  avoidOthers(a, env, dt, maxSpeed);

  // Update heading from velocity when moving (decoupled from avoid)
  const v2 = a.vx * a.vx + a.vy * a.vy;
  if (v2 > 1e-6) {
    const targetHeading = Math.atan2(a.vy, a.vx);
    const turn = 1 - Math.exp(-12 * dt);
    a.heading = lerpAngle(a.heading, targetHeading, turn);
  }

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

  const u = hash01(a.id * 1013 + a.targetN * 9176);
  const v = hash01(a.id * 733 + a.targetN * 31337);

  a.tx = r + u * (w - 2 * r);
  a.ty = r + v * (h - 2 * r);
}

function hash01(n) {
  const x = Math.sin(n) * 43758.5453123;
  return x - Math.floor(x);
}

function seekTarget(a, dt) {
  const dx = a.tx - a.x;
  const dy = a.ty - a.y;
  const d = Math.max(1e-4, Math.sqrt(dx * dx + dy * dy));

  const maxSpeed = 90;
  const slowRadius = 120;

  const desiredSpeed = maxSpeed * Math.min(1, d / slowRadius);

  const dvx = (dx / d) * desiredSpeed;
  const dvy = (dy / d) * desiredSpeed;

  const steer = 6.0;
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
  const r = a.r, w = env.view.w, h = env.view.h;
  const k = 80;

  if (a.x < r)      a.vx += (r - a.x) * k * dt;
  if (a.x > w - r)  a.vx -= (a.x - (w - r)) * k * dt;
  if (a.y < r)      a.vy += (r - a.y) * k * dt;
  if (a.y > h - r)  a.vy -= (a.y - (h - r)) * k * dt;
}

function avoidOthers(a, env, dt, maxSpeed) {
  const agents = env.agents;
  if (!agents) return;

  // Start avoiding earlier than contact
  const desired = a.r * 5.0;          // your original range
  const desired2 = desired * desired;

  // "Personal space" ~ no-overlap distance (handles mixed radii)
  const baseMinSep = a.r * 2.2;

  // Look ahead so head-on approaches get resolved early
  const look = 0.25; // seconds (0.15–0.35 is a good range)

  let fx = 0, fy = 0, count = 0;

  // Predicted self position
  const ax = a.x + a.vx * look;
  const ay = a.y + a.vy * look;

  for (let i = 0; i < agents.length; i++) {
    const b = agents[i];
    if (b === a) continue;

    // Predicted neighbor position
    const bx = b.x + (b.vx || 0) * look;
    const by = b.y + (b.vy || 0) * look;

    const dx = ax - bx;
    const dy = ay - by;
    const d2 = dx * dx + dy * dy;

    if (d2 > 1e-10 && d2 < desired2) {
      const d = Math.sqrt(d2);

      // account for neighbor size if it exists
      const minSep = baseMinSep + (b.r || 0) * 1.1;

      // 0..1 inside desired radius
      const t = Math.max(0, (desired - d) / desired);

      // Stronger near close range (quadratic ramp)
      let w = t * t;

      // If too close, add a much stronger overlap term
      if (d < minSep) {
        const overlap = (minSep - d) / Math.max(1e-6, minSep); // 0..1+
        w += 4.0 * overlap * overlap; // BIG shove when clumping
      }

      fx += (dx / d) * w;
      fy += (dy / d) * w;
      count++;
    }
  }

  if (count > 0) {
    // Option A (force style, like yours but better shaped)
    const strength = 420; // higher is ok now because weight is well-behaved
    a.vx += fx * strength * dt;
    a.vy += fy * strength * dt;
    limitSpeed(a, maxSpeed);

    /*
    const mag = Math.hypot(fx, fy);
    if (mag > 1e-6) {
      fx /= mag; fy /= mag;
      const dvx = fx * maxSpeed;
      const dvy = fy * maxSpeed;
      const steer = 10.0;
      const s = 1 - Math.exp(-steer * dt);
      a.vx += (dvx - a.vx) * s;
      a.vy += (dvy - a.vy) * s;
      limitSpeed(a, maxSpeed);
    }
    */
  }
}


function wanderWiggle(a, dt) {
  a.wanderPhase = (a.wanderPhase ?? (a.id * 10.0)) + dt * 3.0;
  const wig = 200;

  const sx = Math.sin(a.wanderPhase);
  const cx = Math.cos(a.wanderPhase);

  // if heading is weird for any reason, fall back to velocity heading
  const h = (a.heading != null && Number.isFinite(a.heading))
    ? a.heading
    : Math.atan2(a.vy, a.vx);

  const hx = Math.cos(h);
  const hy = Math.sin(h);
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
