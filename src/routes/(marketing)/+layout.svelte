<script lang="ts">
	import AsciiField from '$lib/ascii/AsciiField.svelte';

	let { children } = $props();
</script>

<AsciiField />

<div class="content-layer">
	{@render children()}
</div>

<style>
	.content-layer {
		position: relative;
		z-index: 1;
	}
</style>
