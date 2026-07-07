<script lang="ts">
	import AsciiField from '$lib/ascii/AsciiField.svelte';
	import FieldControls from '$lib/components/FieldControls.svelte';

	let { children } = $props();
</script>

<AsciiField />
<FieldControls />

<div class="content-layer">
	{@render children()}
</div>

<style>
	.content-layer {
		position: relative;
		z-index: 1;
	}
</style>
