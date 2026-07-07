// Central env access. Reads process.env directly - under adapter-node this is
// exactly what $env/dynamic/private resolves to, and it keeps server modules
// importable from standalone bun scripts and tests.
//
// A minimal .env loader runs once on import: `vite dev` executes under node
// (no bun auto-.env), so we hydrate process.env ourselves. Real env vars
// always win over .env file values.
import { readFileSync } from 'node:fs';

try {
	for (const line of readFileSync('.env', 'utf8').split('\n')) {
		const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
		if (m && process.env[m[1]] === undefined) {
			process.env[m[1]] = m[2].replace(/^(["'])(.*)\1$/, '$2');
		}
	}
} catch {
	// no .env file - fine, real env vars only
}

export function required(name: string): string {
	const v = process.env[name];
	if (!v) throw new Error(`Missing required env var: ${name}`);

	return v;
}

export function optional(name: string, fallback = ''): string {
	return process.env[name] ?? fallback;
}

export function flag(name: string): boolean {
	const v = process.env[name];
	return v === '1' || v === 'true' || v === 'yes';
}
