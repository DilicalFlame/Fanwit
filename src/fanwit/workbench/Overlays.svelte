<script lang="ts">
	import Palette from "./Palette.svelte";
	import MenuHost from "./menus/MenuHost.svelte";
	import ToastStack from "./ToastStack.svelte";
	import NotificationCenter from "./NotificationCenter.svelte";
	import VirtualWindows from "./VirtualWindows.svelte";
	import DialogHost from "./DialogHost.svelte";
	import DevOverlays from "./DevOverlays.svelte";
	import PopoverLayer from "./PopoverLayer.svelte";

	/** Everything that floats above a window: shared by the main workbench and other windows. */
</script>

<PopoverLayer />
<VirtualWindows />
<Palette />
<NotificationCenter />
<ToastStack />
<MenuHost />
<DialogHost />
<DevOverlays />
