import type { TractionSource } from '../../db/schema';

export interface TractionResult {
	value: number;
	raw?: unknown;
}

export interface ValidationResult {
	ok: boolean;
	/** true = registry metadata provably points at the project's repo */
	verified: boolean;
	reason?: string;
}

export interface TractionFetcher {
	kind: TractionSource['kind'];
	/** Checks the source exists + whether it provably belongs to the project. */
	validate(externalRef: string, projectRepoUrl: string | null): Promise<ValidationResult>;
	fetch(externalRef: string): Promise<TractionResult>;
}

/** Normalize repo URLs for equality: no protocol/www/.git/trailing slash. */
export function normalizeRepoUrl(url: string | null | undefined): string {
	if (!url) return '';

	return url
		.toLowerCase()
		.replace(/^git\+/, '')
		.replace(/^[a-z]+:\/\//, '')
		.replace(/^www\./, '')
		.replace(/^git@github\.com:/, 'github.com/')
		.replace(/\.git$/, '')
		.replace(/\/+$/, '');
}

export function repoUrlsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
	const na = normalizeRepoUrl(a);
	const nb = normalizeRepoUrl(b);
	return na !== '' && na === nb;
}

/** "owner/repo" from a GitHub URL, or null. */
export function githubRef(repoUrl: string | null | undefined): string | null {
	const n = normalizeRepoUrl(repoUrl);
	const m = n.match(/^github\.com\/([^/]+\/[^/]+)/);
	return m ? m[1] : null;
}
