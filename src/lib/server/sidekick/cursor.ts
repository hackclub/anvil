// Opaque keyset cursors for Sidekick pagination: base64url({ t, id }).
export interface Cursor {
	t: number; // createdAt epoch ms of the last row
	id: string | number; // tiebreaker (int for projects/ships, uuid elsewhere)
}

export function encodeCursor(c: Cursor): string {
	return Buffer.from(JSON.stringify(c)).toString('base64url');
}

export function decodeCursor(raw: string | null | undefined): Cursor | null {
	if (!raw) return null;

	try {
		const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
		if (typeof parsed.t === 'number' && ['string', 'number'].includes(typeof parsed.id)) return parsed;

		return null;
	} catch {
		return null;
	}
}
