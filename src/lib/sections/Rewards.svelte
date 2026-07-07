<script lang="ts">
	import SectionHeading from '$lib/components/SectionHeading.svelte';
	import ShopCarousel from '$lib/ascii/ShopCarousel.svelte';
	import { gridSnap } from '$lib/ascii/gridSnap';
</script>

<section class="rewards" id="rewards">
	<!-- grid cave: the field digs a cell-aligned chamber around this box and
	     draws the breathing walls in its own char grid; text stays DOM/selectable.
	     everything inside is one font size on a 2rem line grid, column-snapped
	     to the background grid (use:gridSnap + ch-based spacing). -->
	<div class="wrap">
		<div class="cave" data-ascii-cave="grid" use:gridSnap>
			<!-- prose keeps generous padding; the strips run near-full-width -->
			<div class="pad">
				<SectionHeading num="02" title="what you can get" />

				<p class="lede">
					the more you code, the more <span class="accent">sparks</span>
					you get. exchange them for prizes, like...
				</p>
			</div>

			<!-- two live shop tickers, slightly tilted and overlapping like
			     dropped film strips - each marches one character per tick -->
			<div class="shopfeed">
				<div class="strip a">
					<ShopCarousel />
				</div>
				<div class="strip b">
					<ShopCarousel dir={-1} phase={0.45} tick={130} />
				</div>
			</div>
		</div>
	</div>
</section>

<style>
	.rewards {
		padding-block: clamp(4rem, 12vh, 8rem);
	}

	/* the CAVE itself bleeds to the viewport edges - the background field
	   carves the chamber from this box's rect, so the chamber spans the full
	   width. prose re-anchors to the page column with generous padding. */
	.cave {
		width: 100vw;
		margin-inline: calc(50% - 50vw);
		padding: 1.5rem 0;
		font-size: var(--fs-md);
		line-height: 2rem;
	}

	.pad {
		padding-inline: max(calc((100vw - var(--maxw)) / 2 + var(--gutter) + 3ch), 4ch);
	}

	.lede {
		margin-bottom: 2rem;
	}

	/* the strips run the cave's full width, each slightly WIDER than the
	   viewport so the tilt never reveals an end */
	.shopfeed {
		width: 100%;
		overflow: hidden;
		padding-block: 2.5rem;
	}

	/* tilted film strips: the strip box rotates, the carousel inside keeps
	   clipping in the strip's frame; solid bg so the overlap occludes */
	.strip {
		width: 106%;
		margin-left: -3%;
		background: var(--bg);
		border-block: 1px solid color-mix(in srgb, var(--dim) 45%, transparent);

		&.a {
			transform: rotate(-2deg);
			margin-top: -2rem;
		}

		&.b {
			transform: rotate(1.4deg);
			margin-top: -5.5rem;
			position: relative;
			z-index: 1;
			box-shadow: 0 -8px 24px color-mix(in srgb, var(--bg) 80%, transparent);
		}
	}
</style>
