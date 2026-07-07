// A set of distinct ASCII "shaders". Each is a pure function of displaced
// sample coords (sx, sy) + time/context, returning luminance in ~[0,1].
// The field component crossfades between them based on scroll position, so the
// background morphs from one shader into the next as you move down the page.

import { fbm } from './noise';

export interface EffectCtx {
	t: number;
	cols: number;
	rows: number;
	aspect: number; // charW/charH (<1)
}

export type Effect = (sx: number, sy: number, c: EffectCtx) => number;

/** 0 - drifting smoke / ink (domain-warped fbm). */
const smoke: Effect = (sx, sy, c) => {
	const px = sx * 0.09 + 100;
	const py = sy * 0.09 + 100;
	const t = c.t * 0.11;
	const qx = fbm(px + t, py);
	const qy = fbm(px + 5.2, py + 1.3 - t);
	let v = fbm(px + 3.5 * qx, py + 3.5 * qy + t * 0.6);
	return v * v * 1.75;
};

/** 1 - interference waves / water. */
const waves: Effect = (sx, sy, c) => {
	const t = c.t;
	const x = sx * 0.16;
	const y = sy * 0.16;
	const w =
		Math.sin(x + t * 0.9) +
		Math.sin(y * 1.3 - t * 0.7) +
		Math.sin((x + y) * 0.7 + t * 0.5) +
		Math.sin(Math.hypot(x - 6, y - 4) * 1.1 - t);

	const n = fbm(sx * 0.05 + t * 0.05, sy * 0.05);
	return (0.5 + 0.13 * w) * 0.7 + n * 0.4;
};

/** 2 - concentric rings pulsing from the center. */
const rings: Effect = (sx, sy, c) => {
	const cx = c.cols / 2;
	const cy = (c.rows / 2) * c.aspect;
	const d = Math.hypot(sx - cx, sy - cy);
	const r = Math.sin(d * 0.28 - c.t * 2.2) * 0.5 + 0.5;
	const n = fbm(sx * 0.06 + c.t * 0.03, sy * 0.06);
	return r * 0.7 * (0.6 + n * 0.7);
};

/** 3 - diagonal woven lattice, slowly sliding. */
const lattice: Effect = (sx, sy, c) => {
	const t = c.t * 0.6;
	const a = Math.sin(sx * 0.32 + t);
	const b = Math.cos(sy * 0.32 - t * 0.8);
	const weave = Math.abs(a * b);
	const n = fbm(sx * 0.08 - t * 0.1, sy * 0.08);
	return weave * 0.75 + n * 0.3;
};

/** 4 - blocky cellular shimmer (quantized noise). */
const cells: Effect = (sx, sy, c) => {
	const q = 0.14;
	const n = fbm(sx * q + c.t * 0.25, sy * q - c.t * 0.12, 3);
	// quantize into steps for a "cellular"/dithered plateau look
	const steps = 5;
	const v = Math.floor(n * steps) / steps;
	return v * 1.6;
};

export const effects: Effect[] = [smoke, waves, rings, lattice, cells];
export const effectNames = ['smoke', 'waves', 'rings', 'lattice', 'cells'];
