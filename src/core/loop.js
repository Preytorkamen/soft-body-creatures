export function StartLoop({
    tick,                       // Update world by tiny step
    render,                     // Draw World
    fixedDt = 1 / 60,           // Each tiny step is 1/60th a second
    maxFrameDt = 0.05,          // If browser freezes, don't go awol
    maxCatchUpTicks = 5,        // Don't do 5,000 updates at once
} = {}) {

    // Remember last time it ran
    let last = performance.now();   // When did last frame happen
    let acc = 0;                    // How much leftover time do we need to simulate

    function Frame(now) {
        // Calculate how much time passed
        let frameDt = (now - last) / 1000;
        last = now;

        // Clamp it so it doesn't go crazy
        frameDt = Math.min(maxFrameDt, Math.max(0, frameDt));
        acc += frameDt;

        // Update world in even slices (deterministic fixed ticks)
        let ticks = 0;
        while (acc >= fixedDt && ticks < maxCatchUpTicks) {
            tick(fixedDt);
            acc -= fixedDt;
            ticks++;
        }

        // Interpolation for smooth animation
        const alpha = fixedDt > 0 ? acc / fixedDt : 0;

        // Render once per frame
        render(alpha, frameDt);

        requestAnimationFrame(Frame);
    }

    // Start the loop
    requestAnimationFrame(Frame);
}