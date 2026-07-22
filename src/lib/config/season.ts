// Program-wide constants. SEASON_START anchors ship windows (shippable hours
// are only counted from it forward) and gates which Hackatime projects we
// list: a project must have a heartbeat since SEASON_START to appear, though
// its displayed total counts all time ever tracked on it.
export const SEASON_START = new Date('2026-07-01T00:00:00Z');

/** Minimum tracked seconds (within the ship window) before a project can ship. */
export const MIN_SHIP_SECONDS = 600; // 10 minutes

export const PROGRAM_NAME = 'Anvil';
