import { createCanvas } from "./core/canvas.js"; // <-- adjust path if needed
import { Amoeba } from "/src/entities/amoeba.js";
import { StartLoop } from "./core/loop.js";
import { createFluidBG } from "./core/fluidbg.js";

// Get Canvas
const canvasEl = document.getElementById("c");
const { ctx, view, resize, clear, clientToCanvas } = createCanvas(canvasEl);



// Fluid
let fluid = createFluidBG(view, { 
scale: 6,
  advect: 2,
  dampVel: 0.985,
  dampDye: 0.98,
  blurIters: 1,
  injectVel: 0.40,
  injectDye: 0.40,
  radius: 3,
});

function onResize() {
  resize();
  fluid = createFluidBG(view, {
    scale: 6,
    advect: 2,
    dampVel: 0.985,
    dampDye: 0.98,
    blurIters: 1,
    injectVel: 0.40,
    injectDye: 0.40,
    radius: 3,
  });
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
    45,
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

let time = 0;
// --- Render (per RAF) ---
function render(alpha, frameDt) {
  metrics.frameDt = frameDt;

  time += frameDt;

  clear();

  
  // Draw world
  drawBackground(ctx, view, time)

  // Fluid: inject + simulate + render overlay
  fluid.injectFromAmoebas(amoebas, frameDt);
  fluid.step(frameDt);
  fluid.render(ctx, view, 0.22); // strength


  for (const a of amoebas) {
    a.draw(ctx);
  }


  // Ensure normal drawing mode for UI
  ctx.globalCompositeOperation = "source-over";

  // draw border
  ctx.save();
  ctx.globalAlpha = 0.4;
  ctx.strokeStyle = "rgba(0,0,0,0.6)";
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, view.w - 1, view.h - 1);
  ctx.restore();
  
  // draw pointer
  ctx.save();
  ctx.globalAlpha = pointer.down ? 1 : 0.7;
  ctx.fillStyle = pointer.down ? "rgba(20,20,20,0.9)" : "rgba(20,20,20,0.65)";
  ctx.beginPath();
  ctx.arc(pointer.x, pointer.y, pointer.down ? 10 : 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // debug overlay
  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.font = "14px system-ui, sans-serif";
   ctx.fillStyle = "rgba(10,10,10,0.85)";
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







function drawBackground(ctx, view, time = 0) {
  const w = view.w, h = view.h;

  // --- Base: fluid gradient ---
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0.0, "#668099ff");   // deep steel-blue
  bg.addColorStop(0.5, "#718b87ff");   // mid
  bg.addColorStop(1.0, "#6d86a5ff");   // light bottom
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // --- Soft vignette ---
  const vignette = ctx.createRadialGradient(
    w * 0.5, h * 0.45, Math.min(w, h) * 0.12,
    w * 0.5, h * 0.55, Math.max(w, h) * 0.85
  );
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.09)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, w, h);

  ctx.restore();
}
