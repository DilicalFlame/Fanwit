<script lang="ts">
	import { adoptPane } from "../../layout/layout.svelte";
	import { getKernel } from "../../ui.svelte";

	/** A slot adopts the pane's pooled host element instead of creating the view (no remount on move). */
	let { pane, hidden = false }: { pane: string; hidden?: boolean } = $props();
	const k = getKernel();
	const layout = k.sys.layout;
</script>

<div
	class="relative min-h-0 min-w-0 flex-1"
	class:hidden
	role="tabpanel"
	tabindex="-1"
	aria-label={layout.paneTitle(pane)}
	data-fw-pane={pane}
	data-fw-view={layout.doc.pane[pane]?.view}
	onfocusin={() => layout.activePane !== pane && layout.focusPane(pane)}
	onpointerdown={() => layout.activePane !== pane && layout.focusPane(pane)}
	use:adoptPane={{ pool: layout.pool, pane }}
></div>
