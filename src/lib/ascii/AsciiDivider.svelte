<script lang="ts">
	interface Props {
		/** band height in rows */
		rows?: number;

		/** glyph size (px) - must match the field grid (16) */
		cell?: number;

		/** optional text baked into the middle of the band (native ASCII) */
		label?: string;
	}

	let { rows = 6, cell = 16, label = '' }: Props = $props();
</script>

<!-- The fixed AsciiField reads this region + draws the wobbly curve into its own grid, so the seam aligns perfectly and its characters overwrite the field. -->
<div
	class="divider"
	data-divider
	data-divider-label={label || undefined}
	aria-hidden="true"
	style="height: {rows * cell}px"
></div>

<style>
	.divider {
		position: relative;
		z-index: 1;
		width: 100%;
		pointer-events: none;
	}
</style>
