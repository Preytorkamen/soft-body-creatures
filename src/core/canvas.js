const canvas = document.getElementById("c");
if (!canvas) throw new Error("Could not find canvas #c");

const ctx = canvas.getContext("2d");
if (!ctx) throw new Error("Could not find 2d context");


// Resize / DPR-correct rendering
/* My understanding is that we need to create a canvas rendering fix that makes
the graphics look crisp and correctly scaled, particularly on high-resolution screens,
like Retina displays.*/

function resize() {

    // Set pixel size of the canvas, scaled up for high DPI screens
    canvas.width = innerWidth * devicePixelRatio;
    canvas.height = innerHeight * devicePixelRatio;

    // Make canvas fill the window properly
    canvas.style.width = innerWidth + "px";
    canvas.style.height = innerHeight + "px";

    // Scale drawn stuff to match CSS pixels
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);

    // Keep center-stuff centered
    world.home.x = innerWidth * 0.5;
    world.home.y = innerHeight * 0.5;
    world.hive.x = world.home.x;
    world.hive.y = world.home.y;
}

addEventListener("resize", resize);
resize();