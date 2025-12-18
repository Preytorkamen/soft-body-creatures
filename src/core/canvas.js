export function createCanvas(canvas) {    
    if (!canvas) throw new Error("Could not find canvas #c");
    
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not find 2d context");
    
    const view = { w: 0, h: 0, dpr: 1 };

    // Resize / DPR-correct rendering   
    function resize() {
        
        const rect = canvas.getBoundingClientRect();
        const dpr = Math.max(1, window.devicePixelRatio || 1);

        view.dpr = dpr;
        view.w = Math.round(rect.width);
        view.h = Math.round(rect.height);

        // Backing buffer size in device pixels
        canvas.width = Math.floor(view.w * dpr);
        canvas.height = Math.floor(view.h * dpr);

        // Keep drawing units in CSS pixels
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function clear() {
        // Because transform maps to CSS pixels, clear with view.w / view.h
        ctx.clearRect(0, 0, view.w, view.h);
    }

    // If not full-window, or if adding camera transforms later
    function clientToCanvas(clientX, clientY) {
        const rect = canvas.getBoundingClientRect();
        return { x: clientX - rect.left, y: clientY - rect.top };
    }

    // Helper for pixel-perfect 1px lines on DPR screens
    function setPixelRatioTransform() {
        ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    }

    return { canvas, ctx, view, resize, clear, clientToCanvas, setPixelRatioTransform };
}