import { AmoebaState, amoebaBrainUpdate } from "../ai/amoebaBrain.js";

function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  return a + d * t;
}
function clamp01(x) { return Math.max(0, Math.min(1, x)); }

function approachExp(current, target, sharpness, dt) {
  const a = 1 - Math.exp(-sharpness * dt);
  return current + (target - current) * a;
}

export class Amoeba {
    constructor(x, y, r, id = 0) {
        this.x = x;
        this.y = y;
        this.r = r;

        this.vx = 0; this.vy = 0;
        this.tx = x; this.ty = y;

        // Seed
        this.id = id;
        this.t = id * 0.37; // deterministic phase
        this.stateTime = (id * 0.13) % 0.8; // desync state
        this.targetN = 0;  // increments each time a target is picked

        this.state = AmoebaState.IDLE;
        this.stateTime = 0;

        this.t = 0; // Deterministic

        this.rSpeed = 0;      // smoothed speed for rendering
        this.rHeading = 0;    // smoothed heading for rendering
        this.prevX = x;
        this.prevY = y;
        this.deform = 0;

        this.ax = 0; this.ay = 0;
        this.prevVx = 0; this.prevVy = 0;
        this.pulse = 0;          // 0..1 muscle activation
        this.turnPulse = 0;      // 0..1 turning activation
        this.turnRate = 0;       // rad/sec-ish

    }

    update(dt, env) {
        this.t += dt;
        amoebaBrainUpdate(this, dt, env);

        // instantaneous motion from sim
        const speed = Math.hypot(this.vx, this.vy);
        const heading = Math.atan2(this.vy, this.vx);

        // smoothing constants
        const speedSmooth = 19; // higher = faster response
        const headSmooth  = 22;

        // exponential smoothing factor (frame-rate independent)
        const as = 1 - Math.exp(-speedSmooth * dt);
        const ah = 1 - Math.exp(-headSmooth * dt);

        // smooth speed
        this.rSpeed += (speed - this.rSpeed) * as;

        // smooth heading using shortest-angle interpolation
        const speedGate = Math.min(1, speed / 12); // 0..1
        const gatedAh = ah * speedGate;
        this.rHeading = lerpAngle(this.rHeading, heading, gatedAh);

        // Deform
        const targetDeform = Math.min(1, speed / 160);
        const ad = 1 - Math.exp(-8 * dt);
        this.deform += (targetDeform - this.deform) * ad;

        // acceleration (from velocity delta)
        const dvx = this.vx - this.prevVx;
        const dvy = this.vy - this.prevVy;
        this.prevVx = this.vx;
        this.prevVy = this.vy;

        const accel = Math.hypot(dvx, dvy) / Math.max(1e-6, dt); // px/s^2-ish

        // turn rate
        const dHead = ((heading - this.rHeading + Math.PI) % (Math.PI * 2)) - Math.PI;
        const turnRate = Math.abs(dHead) / Math.max(1e-6, dt);

        // map to 0..1 activations
        const accelAct = clamp01((accel - 40) / 220);     // start pulsing when accelerating
        const turnAct  = clamp01((turnRate - 2.0) / 10);  // start pulsing on sharp turns

        // smooth pulses (fast rise, slower decay feels muscular)
        this.pulse = approachExp(this.pulse, accelAct, accelAct > this.pulse ? 25 : 8, dt);
        this.turnPulse = approachExp(this.turnPulse, turnAct, turnAct > this.turnPulse ? 30 : 10, dt);

    }

  draw(ctx) {
  ctx.save();

  const steps = 72;
  const base = this.r;
  const t = this.t;

  // motion-derived (set in sim)
  const speed = Math.min(this.rSpeed || 0, 160);
  const dir = Number.isFinite(this.rHeading) ? this.rHeading : 0;
  const s = this.deform;

  const p  = this.pulse;       // acceleration pulse
  const tp = this.turnPulse;   // turn pulse

  // deformation controls
  const bulgeF = (3 * s) * (3 * p);
  const bulgeB = 10 * s;

  const sideSquish = (0.10 + 0.28 * s) * base * (1 + 0.55 * tp);
  const waveAmp = 2.5 * (1 - s) + 1.5 * p;

  const areaComp = 1 - 0.10 * s;

  // Slightly "top-left" key light, plus a small push in travel direction
  const key = -0.9;
  const lx = Math.cos(-Math.PI * 0.35) + Math.cos(dir) * 0.55;
  const ly = Math.sin(-Math.PI * 0.35) + Math.sin(dir) * 0.55;

  // normalize
  const lm = Math.hypot(lx, ly) || 1;
  const Lx = lx / lm;
  const Ly = ly / lm;

  // speed-driven "juice"
  const v = Math.max(0, Math.min(1, speed / 140)); // 0..1

  // centers for gradients / highlights
  const cx = this.x, cy = this.y;

  // Highlight sits toward light direction
  const hx = cx + Lx * base * (0.42 + 0.07 * v);
  const hy = cy + Ly * base * (0.28 + 0.07 * v);

  // Shadow core sits opposite light direction
  const sx0 = cx - Lx * base * (0.18 + 0.04 * v);
  const sy0 = cy - Ly * base * (0.18 + 0.04 * v);

  // Build blob path
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;

    const rel = a - dir;
    const forward = Math.cos(rel);
    const side = Math.sin(rel);

    const dirBulge = (forward > 0 ? forward * bulgeF : forward * bulgeB);
    const squish = -sideSquish * (side * side);

    const wave =
      Math.sin(a * 3 + t * (1.2 + 0.8 * s)) * waveAmp +
      Math.sin(a * 7 - t * (0.9 + 0.5 * s)) * (waveAmp * 0.35);

    const rr = base * areaComp + dirBulge + squish + wave;

    const px = cx + Math.cos(a) * rr;
    const py = cy + Math.sin(a) * rr;

    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();

  // Makes it feel gel-like
  ctx.save();
  ctx.shadowColor = "rgba(220, 255, 230, 0.22)";
  ctx.shadowBlur = 14 + 10 * (1 - s);
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.fillStyle = "rgba(210, 255, 220, 0.10)";
  ctx.fill();
  ctx.restore();

  // Cool-ish shadow core -> mint body -> warm highlight rim
  const body = ctx.createRadialGradient(
    sx0, sy0, base * 0.10,
    cx,  cy,  base * 1.25
  );

  // Shadow core (cool green / teal)
  body.addColorStop(0.0, "rgba(126, 214, 187, 0.7)");
  body.addColorStop(0.34, "rgba(47, 146, 102, 0.45)");

  // Main body (fresh mint)
  body.addColorStop(0.45, "rgba(165, 235, 190, 0.12)");
  body.addColorStop(0.78, "rgba(195, 255, 215, 0.63)");

  // Edge (slightly warmer, more translucent)
  body.addColorStop(1.00, "rgba(113, 255, 141, 0.44)");

  ctx.fillStyle = body;
  ctx.fill();

  // Adds "volume" without muddying the edges
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  const core = ctx.createRadialGradient(
    cx, cy, base * 0.05,
    cx, cy, base * 1.00
  );
  core.addColorStop(0.00, "rgba(120, 170, 140, 0.55)");
  core.addColorStop(0.60, "rgba(120, 170, 140, 0.18)");
  core.addColorStop(1.00, "rgba(120, 170, 140, 0.00)");
  ctx.fillStyle = core;
  ctx.fill();
  ctx.restore();

  // Broad soft highlight
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  const broad = ctx.createRadialGradient(
    hx, hy, base * 0.05,
    hx, hy, base * (0.85 + 0.10 * v)
  );
  broad.addColorStop(0.00, "rgba(255, 255, 255, 0.24)");
  broad.addColorStop(0.45, "rgba(255, 255, 255, 0.10)");
  broad.addColorStop(1.00, "rgba(255, 255, 255, 0.00)");
  ctx.fillStyle = broad;
  ctx.fill();

  // Small specular "spark" (sharper)
  const shx = hx + Lx * base * 0.10;
  const shy = hy + Ly * base * 0.10;
  const spark = ctx.createRadialGradient(
    shx, shy, 0,
    shx, shy, base * (0.18 + 0.06 * v)
  );
  spark.addColorStop(0.00, "rgba(255, 255, 255, 0.55)");
  spark.addColorStop(0.35, "rgba(255, 255, 255, 0.18)");
  spark.addColorStop(1.00, "rgba(255, 255, 255, 0.00)");
  ctx.fillStyle = spark;
  ctx.fill();
  ctx.restore();

  // Dark edge
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineWidth = 1.0 + 0.6 * (1 - s);
  ctx.strokeStyle = "rgba(40, 80, 70, 0.22)";
  ctx.stroke();
  ctx.restore();

  // Light rim (thin)
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.lineJoin = "round";
  ctx.lineWidth = 0.9 + 0.5 * (1 - s);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.26)";
  ctx.stroke();
  ctx.restore();

  ctx.restore();
}

}
