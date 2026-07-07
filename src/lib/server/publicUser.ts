// The safe, client-serializable subset of a users row. NEVER send the raw row
// to the client - it carries encrypted OAuth tokens and PII we don't need in
// the browser.
import type { User } from './db/schema';

export interface PublicUser {
	id: number;
	email: string;
	/** slack username - the PRIMARY display name outside admin surfaces.
	 *  Real names are PII (teens!) and never leave admin/fulfillment. */
	username: string;
	slackId: string | null;
	verificationStatus: User['verificationStatus'];
	yswsEligible: boolean;
	hackatimeConnected: boolean;
	isAdmin: boolean;
}

export function publicUser(u: User): PublicUser {
	return {
		id: u.id,
		email: u.email,
		username: u.username ?? u.email.split('@')[0].toLowerCase(),
		slackId: u.slackId,
		verificationStatus: u.verificationStatus,
		yswsEligible: u.yswsEligible,
		hackatimeConnected: !!u.hackatimeId,
		isAdmin: u.isAdmin
	};
}
