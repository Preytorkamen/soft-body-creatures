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

}