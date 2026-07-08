// Letterbox fill for `object-fit: contain` thumbnails: samples the image's
// edge pixels to recover its own background color and paints the img element
// with it, so an opaque photo (white product shot, colored backdrop) extends
// edge-to-edge instead of floating in a mismatched well. Images with ANY
// transparency along the edge are left alone - the page background is the
// right backdrop for those.
//
// Usage:
//   <img src={url} use:edgeFill />
//
// Sampling needs CORS-clean pixels. Same-origin /uploads always qualifies;
// an S3/R2 origin must send CORS headers or the sample silently no-ops (the
// img keeps whatever CSS background it had).

const SAMPLE = 32; // downscale target - the edge average doesn't need detail

// keyed by URL - the carousel re-mounts the same thumbnails constantly as
// cards scroll in and out, so each image is only ever decoded+sampled once
const cache = new Map<string, Promise<string | null>>();

export function edgeColor(url: string): Promise<string | null> {
	let hit = cache.get(url);
	if (!hit) {
		hit = sample(url).catch(() => null);
		cache.set(url, hit);
	}

	return hit;
}

async function sample(url: string): Promise<string | null> {
	// a separate Image (not the displayed one) so we can request CORS-clean
	// pixels without risking the visible load - crossOrigin on the displayed
	// img would make it fail OUTRIGHT on a CORS-less CDN
	const img = new Image();
	img.crossOrigin = 'anonymous';
	img.src = url;
	await img.decode();

	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = SAMPLE;
	const ctx = canvas.getContext('2d', { willReadFrequently: true });
	if (!ctx) return null;

	ctx.drawImage(img, 0, 0, SAMPLE, SAMPLE);
	const data = ctx.getImageData(0, 0, SAMPLE, SAMPLE).data; // throws if tainted

	let r = 0;
	let g = 0;
	let b = 0;
	let n = 0;
	for (let y = 0; y < SAMPLE; y++) {
		for (let x = 0; x < SAMPLE; x++) {
			// perimeter only - the interior is the subject, not the backdrop
			if (x > 0 && x < SAMPLE - 1 && y > 0 && y < SAMPLE - 1) continue;

			const i = (y * SAMPLE + x) * 4;
			if (data[i + 3] < 250) return null; // transparent edge - don't fill

			r += data[i];
			g += data[i + 1];
			b += data[i + 2];
			n++;
		}
	}

	return `rgb(${Math.round(r / n)} ${Math.round(g / n)} ${Math.round(b / n)})`;
}

/** Svelte action: paint the img's background with its own edge color. */
export function edgeFill(img: HTMLImageElement) {
	let live = true;
	edgeColor(img.src).then((color) => {
		if (live && color) img.style.backgroundColor = color;
	});

	return {
		destroy() {
			live = false;
		}
	};
}
