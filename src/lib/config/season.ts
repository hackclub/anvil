// Program-wide constants. Hours are only ever counted from SEASON_START
// forward - Hackatime activity before the program began doesn't exist to us.
export const SEASON_START = new Date('2026-07-01T00:00:00Z');

/** Minimum tracked seconds (within the ship window) before a project can ship. */
export const MIN_SHIP_SECONDS = 600; // 10 minutes

export const PROGRAM_NAME = 'Anvil';
