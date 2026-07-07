// Screenshot / thumbnail storage. Two backends:
// - S3-compatible (Cloudflare R2) via Bun.S3Client when S3_ENDPOINT is set
// - local disk (.data/uploads) for dev, served by /uploads/[...key]
// Local disk uses node:fs so it works under BOTH runtimes - vite dev runs
// under node (no Bun global), production runs under bun.
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, normalize } from 'node:path';
import { randomBytes } from 'node:crypto';
import { optional } from '../env';

const LOCAL_ROOT = '.data/uploads';

function s3(): Bun.S3Client | null {
	const endpoint = optional('S3_ENDPOINT');
	if (!endpoint) return null;

	if (typeof Bun === 'undefined') {
		throw new Error('S3 storage needs the bun runtime - unset S3_ENDPOINT for local-disk dev');
	}

	return new Bun.S3Client({
		endpoint,
		bucket: optional('S3_BUCKET', 'anvil'),
		accessKeyId: optional('S3_ACCESS_KEY_ID'),
		secretAccessKey: optional('S3_SECRET_ACCESS_KEY')
	});
}

/** Safe path inside the local uploads root (blocks traversal). */
export function localPath(key: string): string {
	const p = normalize(join(LOCAL_ROOT, key));
	if (!p.startsWith(normalize(LOCAL_ROOT))) throw new Error('bad storage key');

	return p;
}

// Raster image types only. SVG is intentionally excluded - it can carry
// <script> and, served from our origin, would be stored XSS. The extension
// (not the client-supplied MIME, which is forgeable) decides how the file is
// later served, so the allowlist is enforced here at the single choke point.
const ALLOWED_EXT: Record<string, string> = {
	png: 'image/png',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	gif: 'image/gif',
	webp: 'image/webp',
	avif: 'image/avif'
};

export class UploadError extends Error {}

export async function storeUpload(file: File, prefix: string): Promise<{ key: string }> {
	const ext = (file.name.split('.').pop() ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
	const contentType = ALLOWED_EXT[ext];
	if (!contentType) throw new UploadError('unsupported image type - use PNG, JPEG, GIF, WebP, or AVIF');

	const key = `${prefix}/${randomBytes(12).toString('hex')}.${ext}`;
	const client = s3();
	if (client) {
		// pin the content-type so R2 can't infer image/svg+xml from the key
		await client.write(key, file, { type: contentType });
	} else {
		const path = localPath(key);
		await mkdir(dirname(path), { recursive: true });
		await writeFile(path, Buffer.from(await file.arrayBuffer()));
	}

	return { key };
}

export async function deleteUpload(key: string): Promise<void> {
	const client = s3();
	if (client) {
		await client.delete(key);
	} else {
		await rm(localPath(key), { force: true });
	}
}

/** Public URL for a stored key (absolute for S3/R2, app-relative for local). */
export function publicUrl(key: string | null): string | null {
	if (!key) return null;

	const base = optional('S3_PUBLIC_URL');
	if (base) return `${base.replace(/\/$/, '')}/${key}`;

	return `/uploads/${key}`;
}

/**
 * Absolute public URL for a stored key. Anything that leaves the app
 * (Sidekick, Airtable, Slack) must use this - a bare `/uploads/...` path
 * means nothing to an external service.
 */
export function absoluteUrl(key: string | null): string | null {
	const url = publicUrl(key);
	if (!url || !url.startsWith('/')) return url;

	const origin = optional('PUBLIC_BASE_URL', 'http://localhost:5173').replace(/\/$/, '');
	return `${origin}${url}`;
}
