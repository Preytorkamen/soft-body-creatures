import { createCanvas } from "./core/canvas.js"; // <-- adjust path if needed
import { Amoeba } from "/src/entities/amoeba.js";
import { StartLoop } from "./core/loop.js";

// Get Canvas
const canvasEl = document.getElementById("c");
const { ctx, view, resize, clear, clientToCanvas } = createCanvas(canvasEl);



function onResize() {
  resize();
}
window.addEventListener("resize", onResize);
onResize();

// --- Input ---
const pointer = { x: 0, y: 0, down: false };

window.addEventListener("mousemove", (e) => {
  const p = clientToCanvas(e.clientX, e.clientY);
  pointer.x = p.x;
  pointer.y = p.y;
});
window.addEventListener("mousedown", () => (pointer.down = true));
window.addEventListener("mouseup", () => (pointer.down = false));

window.addEventListener(
  "touchstart",
  (e) => {
    pointer.down = true;
    const t = e.touches[0];
    const p = clientToCanvas(t.clientX, t.clientY);
    pointer.x = p.x;
    pointer.y = p.y;
  },
  { passive: true }
);

window.addEventListener(
  "touchmove",
  (e) => {
    const t = e.touches[0];
    const p = clientToCanvas(t.clientX, t.clientY);
    pointer.x = p.x;
    pointer.y = p.y;
  },
  { passive: true }
);

window.addEventListener("touchend", () => (pointer.down = false));

// --- Entities ---

//Amoebas
const amoebas = [];

for (let i = 0; i < 15; i++) {
  amoebas.push(new Amoeba(
    50 + (i % 20) * 90,
    300 + Math.floor(i / 20) * 35,
    30,
    i
  ));
}


// --- Simple Instrumentation ---
const metrics = {
  frameDt: 0,
  ticksMsAvg: 0,
  ticksCount: 0,
  ticksThisSecond: 0,
  tickRate: 0,
  _secAcc: 0,
};


// --- Simulation Tick (Fixed dt) ---
function tick(fixedDt) {
  const t0 = performance.now();

  const env = {
    pointer,
    view,
    agents: amoebas
  };

  for (const a of amoebas) {
    a.update(fixedDt, env);
  }

  const tickMs = performance.now() - t0;
  metrics.ticksMsAvg = metrics.ticksMsAvg * 0.9 + tickMs * 0.1; // EMA smoothing
  metrics.ticksCount++;
  metrics.ticksThisSecond++;
  metrics._secAcc += fixedDt;

  if (metrics._secAcc >= 1) {
    metrics.tickRate = metrics.ticksThisSecond / metrics._secAcc;
    metrics.ticksThisSecond = 0;
    metrics._secAcc = 0;
  }
}


// --- Render (per RAF) ---
function render(alpha, frameDt) {
  metrics.frameDt = frameDt;

  clear();

  for (const a of amoebas) {
    a.draw(ctx);
  }

  // draw border
  ctx.save();
  ctx.globalAlpha = 0.4;
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, view.w - 1, view.h - 1);
  ctx.restore();
  
  // draw pointer
  ctx.save();
  ctx.globalAlpha = pointer.down ? 1 : 0.7;
  ctx.beginPath();
  ctx.arc(pointer.x, pointer.y, pointer.down ? 10 : 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // debug overlay
  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.font = "14px system-ui, sans-serif";
  ctx.fillText(
    `view: ${view.w}×${view.h}  dpr: ${view.dpr.toFixed(2)}  dt: ${frameDt.toFixed(3)}`,
    12,
    20
  );
  ctx.fillText(
    `pointer: ${pointer.x.toFixed(1)}, ${pointer.y.toFixed(1)}  down: ${pointer.down}`,
    12,
    40
  );
  ctx.fillText(`tick avg: ${metrics.ticksMsAvg.toFixed(3)}ms rate: ${metrics.tickRate.toFixed(1)}/s`, 12, 60);

  ctx.restore();
}

// -- Start Loop ---
StartLoop({
  tick,
  render,
  fixedDt: 1 / 60,
});
