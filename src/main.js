import { createCanvas } from "./core/canvas.js"; // <-- adjust path if needed

const canvasEl = document.getElementById("c");
const { ctx, view, resize, clear, clientToCanvas } = createCanvas(canvasEl);

function onResize() {
  resize();
}
window.addEventListener("resize", onResize);
onResize();

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

let last = performance.now();

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  clear();


  ctx.save();
  ctx.globalAlpha = 0.4;
  ctx.lineWidth = 1;


  ctx.strokeRect(0.5, 0.5, view.w - 1, view.h - 1);
  ctx.restore();


  const t = now / 1000;
  const cx = view.w * 0.5 + Math.cos(t) * 140;
  const cy = view.h * 0.5 + Math.sin(t * 1.3) * 90;

  ctx.beginPath();
  ctx.arc(cx, cy, 10, 0, Math.PI * 2);
  ctx.fill();


  ctx.save();
  ctx.globalAlpha = pointer.down ? 1 : 0.7;
  ctx.beginPath();
  ctx.arc(pointer.x, pointer.y, pointer.down ? 10 : 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();


  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.font = "14px system-ui, sans-serif";
  ctx.fillText(
    `view: ${view.w}×${view.h}  dpr: ${view.dpr.toFixed(2)}  dt: ${dt.toFixed(3)}`,
    12,
    20
  );
  ctx.fillText(
    `pointer: ${pointer.x.toFixed(1)}, ${pointer.y.toFixed(1)}  down: ${pointer.down}`,
    12,
    40
  );
  ctx.restore();

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
