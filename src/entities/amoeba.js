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
        this.targetN = 0;  // increments each time we pick a target

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

        // smoothing constants (tune these)
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

        // turn rate (how fast heading changes)
        const dHead = ((heading - this.rHeading + Math.PI) % (Math.PI * 2)) - Math.PI;
        const turnRate = Math.abs(dHead) / Math.max(1e-6, dt);

        // map to 0..1 activations (tune thresholds)
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

    const p = this.pulse;       // acceleration pulse
    const tp = this.turnPulse;  // turn pulse


    // deformation controls
    const bulgeF = (10 + 18 * s) * (1 + 0.25 * p); // extra thrust when accelerating
    const bulgeB = 2 + 6 * s;

    const sideSquish = (0.10 + 0.18 * s) * base * (1 + 0.55 * tp); // tighter on turns
    const waveAmp = 2.5 + 2.2 * (1 - s) + 1.5 * p; // “alive” surface response


    // small area-ish compensation so it doesn't inflate too much
    const areaComp = 1 - 0.10 * s;

    // Gradient shifts toward travel direction
    const gx = this.x + Math.cos(dir) * (6 + 10 * s);
    const gy = this.y + Math.sin(dir) * (6 + 10 * s);

    const g = ctx.createRadialGradient(
      gx, gy, base * 0.15,
      this.x, this.y, base * 1.25
    );
    g.addColorStop(0,   "rgba(120, 160, 120, 0.9)");
    g.addColorStop(0.7, "rgba(180, 220, 180, 0.4)");
    g.addColorStop(1,   "rgba(203, 255, 203, 0.65)");

    ctx.beginPath();

    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * Math.PI * 2;

      // relative to travel direction
      const rel = a - dir;
      const forward = Math.cos(rel);   // -1..1
      const side = Math.sin(rel);      // -1..1

      // directional bulge: front grows more than back
      const dirBulge =
        (forward > 0 ? forward * bulgeF : forward * bulgeB);

      // squish sides (strongest at ±90°)
      const squish = -sideSquish * (side * side);

      // surface wave (slows down when moving fast)
      const wave =
        Math.sin(a * 3 + t * (1.2 + 0.8 * s)) * waveAmp +
        Math.sin(a * 7 - t * (0.9 + 0.5 * s)) * (waveAmp * 0.35);

      const rr = base * areaComp + dirBulge + squish + wave;

      const px = this.x + Math.cos(a) * rr;
      const py = this.y + Math.sin(a) * rr;

      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }

    ctx.closePath();
    ctx.fillStyle = g;
    ctx.fill();

    ctx.lineJoin = "round";
    ctx.lineWidth = 1.2 + 0.6 * (1 - s);
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.stroke();

    ctx.restore();
  }
}
