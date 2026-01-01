// src/core/fluidbg.js
export function createFluidBG(view, opts = {}) {
  const scale = opts.scale ?? 8;                  // bigger = cheaper, blurrier
  const W = Math.max(32, Math.floor(view.w / scale));
  const H = Math.max(32, Math.floor(view.h / scale));

  // velocity (vx, vy) and dye (d)
  const vx = new Float32Array(W * H);
  const vy = new Float32Array(W * H);
  const dye = new Float32Array(W * H);
  const dye2 = new Float32Array(W * H);

  const tmp = new Float32Array(W * H);

  // parameters
  const dampVel = opts.dampVel ?? 0.985;
  const dampDye = opts.dampDye ?? 0.992;
  const advect = opts.advect ?? 0.9;
  const injectVel = opts.injectVel ?? 0.35;       // how much amoebas push
  const injectDye = opts.injectDye ?? 0.35;       // how visible wakes are
  const radius = opts.radius ?? 10;               // in grid cells (scaled)
  const blurIters = opts.blurIters ?? 2;

  function resizeIfNeeded() {
    // if view size changed a lot, recreate (simple approach)
    const nW = Math.max(32, Math.floor(view.w / scale));
    const nH = Math.max(32, Math.floor(view.h / scale));
    if (nW === W && nH === H) return false;
    return true; // caller recreates by calling createFluidBG again
  }

  function idx(x, y) { return x + y * W; }

  function sample(field, x, y) {
    // bilinear sample, x/y in grid coords
    x = Math.max(0, Math.min(W - 1.001, x));
    y = Math.max(0, Math.min(H - 1.001, y));
    const x0 = x | 0, y0 = y | 0;
    const x1 = x0 + 1, y1 = y0 + 1;
    const tx = x - x0, ty = y - y0;

    const i00 = idx(x0, y0);
    const i10 = idx(Math.min(W - 1, x1), y0);
    const i01 = idx(x0, Math.min(H - 1, y1));
    const i11 = idx(Math.min(W - 1, x1), Math.min(H - 1, y1));

    const a = field[i00] * (1 - tx) + field[i10] * tx;
    const b = field[i01] * (1 - tx) + field[i11] * tx;
    return a * (1 - ty) + b * ty;
  }

  function blur(field) {
    // separable-ish cheap blur: 4-neighbor relax
    for (let it = 0; it < blurIters; it++) {
      // copy
      tmp.set(field);
      for (let y = 1; y < H - 1; y++) {
        for (let x = 1; x < W - 1; x++) {
          const i = idx(x, y);
          field[i] = (tmp[i] * 4.15 +
                      tmp[i - 1] + tmp[i + 1] +
                      tmp[i - W] + tmp[i + W]) / 8;
        }
      }
    }
  }

  function addSplat(worldX, worldY, dvx, dvy, amount, rad = radius) {
    const gx = worldX / scale;
    const gy = worldY / scale;

    const r = rad;
    const r2 = r * r;

    const x0 = Math.max(0, Math.floor(gx - r));
    const x1 = Math.min(W - 1, Math.ceil(gx + r));
    const y0 = Math.max(0, Math.floor(gy - r));
    const y1 = Math.min(H - 1, Math.ceil(gy + r));

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x - gx;
        const dy = y - gy;
        const d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;

        const falloff = Math.exp(-d2 / (r2 * 0.35));
        const i = idx(x, y);

        vx[i] += dvx * falloff * amount;
        vy[i] += dvy * falloff * amount;

        dye[i] += falloff * amount;
      }
    }
  }

  function step(dt) {
    // damp
    for (let i = 0; i < vx.length; i++) {
      vx[i] *= dampVel;
      vy[i] *= dampVel;
      dye[i] *= dampDye;
    }

    // advect dye by velocity (semi-lagrangian backtrace)
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = idx(x, y);
        const backX = x - vx[i] * advect * dt;
        const backY = y - vy[i] * advect * dt;
        dye2[i] = sample(dye, backX, backY);
      }
    }
    dye.set(dye2);

    // soften
    blur(dye);
  }

  function injectFromAmoebas(amoebas, dt) {
    for (const a of amoebas) {
      // Use velocity if you have it; otherwise approximate from heading/speed
      const ax = a.vx ?? Math.cos(a.rHeading || 0) * (a.rSpeed || 0);
      const ay = a.vy ?? Math.sin(a.rHeading || 0) * (a.rSpeed || 0);

      const sp = Math.hypot(ax, ay);
      if (sp < 0.5) continue;

      // Normalize push direction and scale by speed
      const nx = ax / sp;
      const ny = ay / sp;

      const push = injectVel * Math.min(1, sp / 120);
      const ink  = injectDye * Math.min(1, sp / 120);

      // push fluid forward, and leave dye wake behind (opposite direction)
      addSplat(
        a.x - nx * (a.r * 0.9),
        a.y - ny * (a.r * 0.9),
        -nx * push * 0.9,
        -ny * push * 0.9,
        ink * dt * 90,
        radius * 0.8
    );

      // wake behind
      addSplat(
        a.x - nx * (a.r * 0.6),
        a.y - ny * (a.r * 0.6),
        -nx * push * 0.6,
        -ny * push * 0.6,
        ink * dt * 60,
        radius * 0.9
      );
    }
  }

  // draw using ImageData (fast enough at low res)
  const img = new ImageData(W, H);
  const data = img.data;

  function render(ctx, view, strength = 0.22) {
    // Map dye to subtle brightness variation (blue-gray “fluid”)
    for (let i = 0; i < dye.length; i++) {
      const d = Math.max(0, Math.min(1, dye[i])); // 0..1
      const v = d * 255;

      // base is transparent; we’ll overlay on top of your gradient
      data[i * 4 + 0] = 255;
      data[i * 4 + 1] = 255;
      data[i * 4 + 2] = 255;
      data[i * 4 + 3] = Math.max(0, Math.min(255, v * strength));
    }

    // draw low-res buffer scaled up
    const w = view.w, h = view.h;

    // Create an offscreen canvas per render call? Instead reuse a cached one:
    // easiest: use putImageData to a temporary canvas
    if (!render._c) {
      render._c = document.createElement("canvas");
      render._ctx = render._c.getContext("2d", { willReadFrequently: true });
    }
    const oc = render._c;
    const octx = render._ctx;

    oc.width = W;
    oc.height = H;
    octx.putImageData(img, 0, 0);

    ctx.save();
    ctx.globalCompositeOperation = "color-dodge";
    ctx.globalAlpha = .5;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(oc, 0, 0, w, h);
    ctx.restore();
  }

  return {
    W, H, scale,
    resizeIfNeeded,
    step,
    injectFromAmoebas,
    render,
    // expose for tuning if you want
    vx, vy, dye
  };
}
