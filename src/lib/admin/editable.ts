// Which entity fields the admin inspector may edit, with type info for the
// property-sheet editors. Shared between client (picks the right editor) and
// server (validates + parses before writing). Anything not listed renders
// read-only - ids, foreign keys, timestamps, write-once audit blobs, and the
// append-only ledger stay untouchable.
//
// Raw edits here are deliberately side-effect-free (no score recompute, no
// ledger writes) - that's what the explicit action buttons are for.

export type FieldSpec =
	| { type: 'string'; nullable?: boolean; multiline?: boolean }
	| { type: 'int'; nullable?: boolean; min?: number; max?: number }
	| { type: 'number'; nullable?: boolean }
	| { type: 'boolean' }
	| { type: 'enum'; options: readonly string[] };

export const EDITABLE: Record<string, Record<string, FieldSpec>> = {
	project: {
		title: { type: 'string' },
		description: { type: 'string', multiline: true },
		demoUrl: { type: 'string', nullable: true },
		repoUrl: { type: 'string', nullable: true },
		screenshotKey: { type: 'string', nullable: true },
		shipStatus: {
			type: 'enum',
			options: ['draft', 'pending', 'pending_hq', 'approved', 'rejected']
		},
		locked: { type: 'boolean' },
		level: { type: 'int', min: 1, max: 10 },
		score: { type: 'number' },
		maxReviewedLevel: { type: 'int', min: 1, max: 10 },
		scoreFlagged: { type: 'boolean' }
	},
	owner: {
		username: { type: 'string', nullable: true },
		email: { type: 'string' },
		slackId: { type: 'string', nullable: true },
		verificationStatus: {
			type: 'enum',
			options: ['needs_submission', 'pending', 'verified', 'ineligible']
		},
		yswsEligible: { type: 'boolean' },
		hackatimeId: { type: 'string', nullable: true },
		hackatimeTrustLevel: { type: 'enum', options: ['blue', 'green', 'red'] },
		isAdmin: { type: 'boolean' },
		isBanned: { type: 'boolean' },
		banReason: { type: 'string', nullable: true, multiline: true },
		internalNotes: { type: 'string', nullable: true, multiline: true }
	},
	ship: {
		status: { type: 'enum', options: ['pending', 'pending_hq', 'approved', 'rejected'] },
		hoursAssigned: { type: 'number', nullable: true },
		hardRejected: { type: 'boolean' }
	},
	review: {
		held: { type: 'boolean' },
		hoursAssigned: { type: 'number', nullable: true },
		feedback: { type: 'string', nullable: true, multiline: true },
		justification: { type: 'string', nullable: true, multiline: true },
		internalMessage: { type: 'string', nullable: true, multiline: true }
	},
	tractionSource: {
		externalRef: { type: 'string' },
		verified: { type: 'boolean' },
		lastValue: { type: 'int', nullable: true },
		errorCount: { type: 'int', min: 0 }
	},
	// hackatime links are managed via dedicated link/unlink actions (they
	// carry an invariant: one key -> one project per user), not raw edits
	// append-only by design - inspect only
	ledger: {}
};
