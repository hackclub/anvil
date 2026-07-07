// Cheap value noise + fbm for the ASCII smoke field.
// Uses an integer hash (no trig in the hot path) so we can afford thousands
// of samples per frame.

export function hash2(ix: number, iy: number): number {
	let h = (ix | 0) * 374761393 + (iy | 0) * 668265263;
	h = (h ^ (h >>> 13)) * 1274126177;
	h = h ^ (h >>> 16);
	return (h >>> 0) / 4294967295;
}

function smooth(t: number): number {
	return t * t * (3 - 2 * t);
}

/** 2D value noise in [0,1]. */
export function vnoise(x: number, y: number): number {
	const xi = Math.floor(x);
	const yi = Math.floor(y);
	const xf = x - xi;
	const yf = y - yi;

	const a = hash2(xi, yi);
	const b = hash2(xi + 1, yi);
	const c = hash2(xi, yi + 1);
	const d = hash2(xi + 1, yi + 1);

	const u = smooth(xf);
	const v = smooth(yf);

	return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

/** Fractal brownian motion - `octaves` layers of value noise. */
export function fbm(x: number, y: number, octaves = 2): number {
	let sum = 0;
	let amp = 0.6;
	let freq = 1;
	for (let o = 0; o < octaves; o++) {
		sum += amp * vnoise(x * freq, y * freq);
		freq *= 2.02;
		amp *= 0.5;
	}

	return sum;
}
