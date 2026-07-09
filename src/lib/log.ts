// Structured logging, one call, two destinations.
//
// Every log goes to BOTH:
//   1. the console (stdout for info/debug, stderr for warn/error) - so it shows
//      up in `vite dev`, `bun ./build/index.js`, and the container logs; and
//   2. Sentry structured logs (enableLogs is on in every Sentry.init), tagged
//      with a `scope` and `side` (server|client) plus any structured data.
//
// When a thrown value is attached (via the `err` field on the data object, or
// the dedicated `log.exception` helper) it's ALSO sent to Sentry as a captured
// exception, so it surfaces as an Issue and not just a log line.
//
// Isomorphic on purpose: `@sentry/sveltekit` resolves to the node SDK on the
// server and the browser SDK on the client, and both expose the same
// `Sentry.logger` + `captureException` surface. Import it anywhere - side is
// sniffed from `window` rather than `$app/environment`, so this stays importable
// from plain bun/node scripts and unit tests too.
import * as Sentry from '@sentry/sveltekit';

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

/**
 * Free-form structured context. Two reserved keys:
 *  - `err`: a caught throwable - printed with its stack and (for error/fatal)
 *    captured as a Sentry exception.
 *  - `capture`: set `false` to skip the Sentry exception capture (e.g. when
 *    something upstream, like Sentry's own error hook, already reported it).
 */
export type LogData = Record<string, unknown> & { err?: unknown; capture?: boolean };

const RESERVED = new Set(['err', 'capture']);

const SIDE: 'server' | 'client' = typeof window === 'undefined' ? 'server' : 'client';

// Sentry log attributes must be primitive-ish; flatten anything richer to a
// string so a stray object/array can't drop the whole log line.
function toAttrs(scope: string, data: LogData | undefined): Record<string, string | number | boolean> {
	const attrs: Record<string, string | number | boolean> = { scope, side: SIDE };
	if (!data) return attrs;

	for (const [k, v] of Object.entries(data)) {
		if (RESERVED.has(k)) continue; // handled separately (err -> exception, capture -> control)

		if (v == null) continue;

		if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
			attrs[k] = v;
		} else if (v instanceof Error) {
			attrs[k] = v.message;
		} else {
			try {
				attrs[k] = JSON.stringify(v);
			} catch {
				attrs[k] = String(v);
			}
		}
	}

	return attrs;
}

function consoleFn(level: LogLevel): (...args: unknown[]) => void {
	switch (level) {
		case 'error':
		case 'fatal':
			return console.error;
		case 'warn':
			return console.warn;
		case 'trace':
		case 'debug':
			return console.debug ?? console.log;
		default:
			return console.log;
	}
}

function emit(level: LogLevel, scope: string, message: string, data?: LogData): void {
	const { err } = data ?? {};

	// 1. console - `[scope] message { …data }`, err appended last so its stack shows
	const line = `[${scope}] ${message}`;
	const rest: unknown[] = [];
	const trimmed = data ? { ...data } : undefined;
	if (trimmed) {
		for (const k of RESERVED) delete trimmed[k];
	}

	if (trimmed && Object.keys(trimmed).length) rest.push(trimmed);

	if (err !== undefined) rest.push(err);

	try {
		consoleFn(level)(line, ...rest);
	} catch {
		// never let logging throw
	}

	// 2. Sentry structured log
	try {
		Sentry.logger?.[level]?.(message, toAttrs(scope, data));
	} catch {
		// Sentry not initialised (tests, scripts) - console already has it
	}

	// 3. attached throwable -> Sentry Issue (unless capture is opted out)
	if (err !== undefined && data?.capture !== false && (level === 'error' || level === 'fatal')) {
		try {
			Sentry.captureException(err, { tags: { scope, side: SIDE }, extra: toAttrs(scope, data) });
		} catch {
			// ignore
		}
	}
}

export interface Logger {
	trace(message: string, data?: LogData): void;
	debug(message: string, data?: LogData): void;
	info(message: string, data?: LogData): void;
	warn(message: string, data?: LogData): void;
	error(message: string, data?: LogData): void;
	fatal(message: string, data?: LogData): void;
	/** Report a caught throwable as an error + Sentry exception. Sugar for `error(msg, { err, ...data })`. */
	exception(message: string, err: unknown, data?: LogData): void;
	/** Derive a nested-scope logger, e.g. `log.child('sync')` -> scope "airtable.sync". */
	child(subScope: string): Logger;
}

/**
 * Make a scoped logger. Give it a short dotted namespace matching the module,
 * e.g. `createLogger('auth')`, `createLogger('jobs.traction')`.
 */
export function createLogger(scope: string): Logger {
	return {
		trace: (m, d) => emit('trace', scope, m, d),
		debug: (m, d) => emit('debug', scope, m, d),
		info: (m, d) => emit('info', scope, m, d),
		warn: (m, d) => emit('warn', scope, m, d),
		error: (m, d) => emit('error', scope, m, d),
		fatal: (m, d) => emit('fatal', scope, m, d),
		exception: (m, err, d) => emit('error', scope, m, { ...d, err }),
		child: (sub) => createLogger(`${scope}.${sub}`)
	};
}
