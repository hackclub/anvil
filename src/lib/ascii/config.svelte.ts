// Live-tunable settings for the ASCII field. Shared reactive state so the
// on-page tinker panel and the render engine stay in sync. Left in prod on
// purpose - for the curious.

export interface FieldConfig {
	cell: number; // grid / font size (px)
	density: number; // ambient field brightness
	spread: number; // how wide particles spawn (ball size)
	cluster: number; // smoke particles per path step
	sparkChance: number; // chance to shed a spark per step
	buoy: number; // upward buoyancy
	swirl: number; // curl-noise turbulence
	drag: number; // velocity damping
	inherit: number; // how much cursor speed the trail keeps
	pstr: number; // smoke opacity / strength
	cap: number; // max live particles
	glitch: boolean; // glitch / spark bursts
}

export const DEFAULTS: FieldConfig = {
	cell: 16,
	density: 0.45,
	spread: 5,
	cluster: 4,
	sparkChance: 0.16,
	buoy: 11.5,
	swirl: 6.5,
	drag: 3,
	inherit: 0.05,
	pstr: 0.95,
	cap: 780,
	glitch: true
};

export const cfg = $state<FieldConfig>({ ...DEFAULTS });

export function resetConfig() {
	Object.assign(cfg, DEFAULTS);
}
