<script>
    import { Window } from "$lib";
    const askDialog = Window.DialogWindow.ask;
</script>
<h1>Welcome to SvelteKit</h1>
<p>Visit <a href="https://svelte.dev/docs/kit">svelte.dev/docs/kit</a> to read the documentation</p>

<div onclick={() => askDialog("Hello", {title: "Tauri", kind: "warning"})}>Click</div>
