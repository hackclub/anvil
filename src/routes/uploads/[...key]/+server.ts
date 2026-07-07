import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { error } from '@sveltejs/kit';
import { localPath } from '$lib/server/services/storage';
import type { RequestHandler } from './$types';

// Only raster image types we serve inline. SVG is deliberately excluded: it
// can carry <script> and would execute in our own origin, so it's never
// served as image/svg+xml (see the octet-stream + attachment fallback below).
const MIME: Record<string, string> = {
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.gif': 'image/gif',
	'.webp': 'image/webp',
	'.avif': 'image/avif'
};

export const GET: RequestHandler = async ({ params }) => {
	let body: Buffer;
	try {
		body = await readFile(localPath(params.key));
	} catch {
		error(404);
	}

	const type = MIME[extname(params.key).toLowerCase()];

	return new Response(new Uint8Array(body), {
		headers: {
			// unknown/unsafe extensions are forced to download, never rendered
			'Content-Type': type ?? 'application/octet-stream',
			...(type ? {} : { 'Content-Disposition': 'attachment' }),
			// belt-and-braces against content sniffing / script execution even if
			// a bad type slips through
			'X-Content-Type-Options': 'nosniff',
			'Content-Security-Policy': "default-src 'none'; sandbox",
			'Cache-Control': 'public, max-age=31536000, immutable'
		}
	});
};
