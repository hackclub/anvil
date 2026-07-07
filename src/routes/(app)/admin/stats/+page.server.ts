// Growth stats: signups, a granular activation funnel, and the numbers we
// actually optimize for - hours shipped and user conversion.
import { sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import type { PageServerLoad } from './$types';

type Row = Record<string, unknown>;
const rows = async (q: ReturnType<typeof sql>): Promise<Row[]> => (await db().execute(q)) as unknown as Row[];

const n = (v: unknown): number => (v == null ? 0 : Number(v));

export const load: PageServerLoad = async () => {
	// signups per day, zero-filled over the last 30 days
	const signupsByDay = (
		await rows(sql`
			select to_char(d, 'YYYY-MM-DD') as day, coalesce(c.n, 0) as n
			from generate_series(
				date_trunc('day', now()) - interval '29 days',
				date_trunc('day', now()),
				interval '1 day'
			) d
			left join (
				select date_trunc('day', created_at) cd, count(*) n
				from users where deleted_at is null
				group by 1
			) c on c.cd = d
			order by d
		`)
	).map((r) => ({ day: String(r.day), n: n(r.n) }));

	// approved hours per day (by decision date), zero-filled - the line we
	// want to see go up
	const hoursByDay = (
		await rows(sql`
			select to_char(d, 'YYYY-MM-DD') as day, coalesce(h.n, 0) as n
			from generate_series(
				date_trunc('day', now()) - interval '29 days',
				date_trunc('day', now()),
				interval '1 day'
			) d
			left join (
				select date_trunc('day', decided_at) dd, sum(hours_assigned) n
				from ships where status = 'approved' and decided_at is not null
				group by 1
			) h on h.dd = d
			order by d
		`)
	).map((r) => ({ day: String(r.day), n: n(r.n) }));

	// the user funnel. submitted/approved reflect CURRENT project state, so
	// a rejected project drops back out.
	const [f] = await rows(sql`
		select
			(select count(*) from users where deleted_at is null) as all_users,
			(select count(*) from users where deleted_at is null
				and hackatime_id is not null) as hackatime,
			(select count(*) from users where deleted_at is null and ysws_eligible) as idv,
			(select count(distinct user_id) from projects where deleted_at is null) as created,
			(select count(distinct user_id) from projects where deleted_at is null
				and ship_status in ('pending', 'pending_hq', 'approved')) as submitted,
			(select count(distinct user_id) from projects where deleted_at is null
				and ship_status = 'approved') as approved
	`);

	const funnel = [
		{ stage: 'all users', n: n(f.all_users) },
		{ stage: 'hackatime linked', n: n(f.hackatime) },
		{ stage: 'idv verified', n: n(f.idv) },
		{ stage: 'project created', n: n(f.created) },
		{ stage: 'project submitted', n: n(f.submitted) },
		{ stage: 'project approved', n: n(f.approved) }
	];

	// sessions extend at most once a day, so updated_at approximates
	// last_active at daily granularity.
	const [a] = await rows(sql`
		select
			(select count(distinct user_id) from sessions
				where updated_at > now() - interval '24 hours') as active_today,
			(select count(distinct user_id) from sessions
				where updated_at > now() - interval '7 days') as active_week,
			(select count(*) from ships where created_at > now() - interval '7 days') as shipped_week,
			(select count(*) from ships where status = 'approved'
				and decided_at > now() - interval '7 days') as approved_week
	`);

	const activity = {
		activeToday: n(a.active_today),
		activeThisWeek: n(a.active_week),
		shippedThisWeek: n(a.shipped_week),
		approvedThisWeek: n(a.approved_week)
	};

	// hours + sparks - what we're maximizing
	const [h] = await rows(sql`
		select
			coalesce((select sum(hours_assigned) from ships where status = 'approved'), 0) as approved_hours,
			coalesce((select sum(hours_assigned) from ships where status = 'approved'
				and decided_at > now() - interval '7 days'), 0) as approved_hours_7d,
			coalesce((select sum(hours_assigned) from ships where status = 'approved'
				and decided_at > now() - interval '30 days'), 0) as approved_hours_30d,
			coalesce((select sum(seconds_submitted) / 3600.0 from ships
				where status in ('pending', 'pending_hq')), 0) as pending_hours,
			(select count(*) from ships) as ships_total,
			(select count(*) from ships where status = 'approved') as ships_approved,
			(select count(*) from ships where status in ('pending', 'pending_hq')) as ships_pending,
			coalesce((select sum(amount) from currency_ledger where amount > 0), 0) as sparks_earned,
			coalesce((select -sum(amount) from currency_ledger where amount < 0), 0) as sparks_spent
	`);

	// conversion speed: median days from signup to first project / first ship
	const [m1] = await rows(sql`
		select percentile_cont(0.5) within group (
			order by extract(epoch from fp.first - u.created_at) / 86400.0
		) as med
		from users u
		join (select user_id, min(created_at) first from projects group by user_id) fp
			on fp.user_id = u.id
	`);

	const [m2] = await rows(sql`
		select percentile_cont(0.5) within group (
			order by extract(epoch from fs.first - u.created_at) / 86400.0
		) as med
		from users u
		join (select user_id, min(created_at) first from ships group by user_id) fs
			on fs.user_id = u.id
	`);

	return {
		signupsByDay,
		hoursByDay,
		funnel,
		activity,
		hours: {
			approved: n(h.approved_hours),
			approved7d: n(h.approved_hours_7d),
			approved30d: n(h.approved_hours_30d),
			pending: n(h.pending_hours),
			shipsTotal: n(h.ships_total),
			shipsApproved: n(h.ships_approved),
			shipsPending: n(h.ships_pending)
		},
		sparks: { earned: n(h.sparks_earned), spent: n(h.sparks_spent) },
		medianDaysToFirstProject: m1?.med == null ? null : n(m1.med),
		medianDaysToFirstShip: m2?.med == null ? null : n(m2.med)
	};
};
