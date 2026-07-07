// Shared position of the draggable forge window, published by ForgeTerminal and
// read by AsciiRings so the rings always emit from the window's center.
//
// cx/cy are in character cells relative to the finale's top-left. This works
// because both components share that origin (the SignUp section is the finale's
// first in-flow child, and .finale-bg is inset:0) AND the same cell size - keep
// both mounted with the same `cell` (default 16) for the coords to line up.
export const forgeWindow = $state({ cx: 0, cy: 0, active: false });
