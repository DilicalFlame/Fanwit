<script lang="ts">
	import { untrack, type Component } from "svelte";
	import { getKernel } from "../../ui.svelte";
	import Icon from "../../icons/Icon.svelte";
	import EmptyState from "../../workbench/EmptyState.svelte";
	import { manualState } from "../../manual/state.svelte";
	import { render } from "../../manual/markdown";
	import { slug } from "../../manual/links.mjs";
	import { docsets, readingMinutes, titleOf } from "../../manual/docs";
	import LearningPaths from "./LearningPaths.svelte";
	import { siteVersion } from "virtual:fw-docs";
	import ApiSymbolView from "./ApiSymbol.svelte";
	import { animateFigure, animated, type FigureAnimation } from "../../manual/figure-anim";

	/**
	 * One manual page in a tab (Figure 17.15): a written page (Markdown compiled to a component),
	 * a generated reference, or an API symbol. It measures which sections are on screen for the
	 * outline, and runs the assistive reading modes (bionic, focus, ruler, read aloud).
	 */
	let { paneId, props }: { paneId: string; props: { page?: string } } = $props();
	const k = getKernel();
	const st = manualState(k);
	const key = $derived(props.page || st.home() || "");
	const page = $derived(st.find(key));
	const set = $derived(docsets.find((s) => s.id === page?.set));
	const active = $derived(st.activePane === paneId);
	const setting = <T,>(name: string) => k.sys.settings.get<T>(`manual.${name}`);
	const bionic = $derived(setting<boolean>("bionic"));
	const focusMode = $derived(setting<boolean>("focus"));
	const ruler = $derived(setting<boolean>("ruler"));

	let scroller = $state<HTMLElement>();
	let body = $state<HTMLElement>();
	let Comp = $state<Component | null>(null);
	let status = $state<"idle" | "loading" | "error">("idle");
	let error = $state("");
	let headings = $state.raw<{ level: number; text: string; id: string }[]>([]);
	let rulerY = $state<number | null>(null);
	let speaking = $state<"off" | "on" | "paused">("off");
	let pendingAnchor = "";

	// written pages load their compiled component
	$effect(() => {
		const p = page;
		Comp = null;
		if (p?.source !== "written" || !p.component) return;
		status = "loading";
		p.component()
			.then((m) => {
				if (page !== p) return;
				Comp = m.default;
				status = "idle";
			})
			.catch((e: Error) => {
				status = "error";
				error = e.message ?? String(e);
			});
	});
	// API pages need the TypeDoc reference
	$effect(() => {
		if (/\/api\//.test(key) && st.apiState === "idle") void st.loadApi();
	});
	const generated = $derived(page?.source === "generated" && page.markdown ? render(page.markdown(k)).html : "");

	// a tab opened without a page shows the docset's start page: name the tab after it
	$effect(() => {
		if (!props.page && page) k.sys.layout.titles[paneId] = page.title;
	});

	// the active page drives the navigation (docset, kind) and the docs site's address bar
	// (only when the page or its activeness changes: the catalog grows when the API loads)
	const pageKey = $derived(page?.key);
	$effect(() => {
		if (!active || !pageKey) return;
		untrack(() => {
			if (!page) return;
			st.set = page.set;
			st.kind = page.kind;
			st.syncUrl(page.key);
		});
	});

	// ----- after each render: heading ids and permalinks, bionic text, search highlights -----
	// The page changes its own DOM here (permalinks, bionic text). Those changes must not wake the
	// observer again, or the page feeds itself forever: their records are dropped at the end.
	let observer: MutationObserver | null = null;
	let scheduled = 0;
	const schedule = () => (scheduled ||= requestAnimationFrame(() => ((scheduled = 0), enhance())));
	// diagrams play when they come into view and pause off screen; a click opens one large
	const figures = new Map<HTMLElement, FigureAnimation | null>();
	const watched = new WeakSet<HTMLElement>();
	const inView =
		typeof IntersectionObserver === "undefined"
			? null
			: new IntersectionObserver(
					(entries) => {
						for (const e of entries) {
							const fig = e.target as HTMLElement;
							if (figures.has(fig)) figures.get(fig)?.pause(!e.isIntersecting);
							else if (e.isIntersecting) figures.set(fig, animateFigure(fig.querySelector("svg")!));
						}
					},
					{ threshold: 0.35 }
				);
	function wireFigures(root: HTMLElement) {
		for (const [fig, a] of figures) if (!fig.isConnected) (a?.kill(), figures.delete(fig));
		for (const fig of root.querySelectorAll<HTMLElement>(".fw-tikz[data-figure]")) {
			if (watched.has(fig)) continue;
			watched.add(fig);
			inView?.observe(fig);
			if (animated(fig)) fig.insertAdjacentHTML("beforeend", '<button type="button" class="fw-figure-replay" aria-label="Play the animation again">Play again</button>');
		}
	}
	$effect(() => () => {
		inView?.disconnect();
		for (const a of figures.values()) a?.kill();
	});

	function enhance() {
		if (!body) return;
		wireFigures(body);
		const seen = new Map<string, number>();
		const list: typeof headings = [];
		for (const h of body.querySelectorAll<HTMLElement>("h1, h2, h3, h4")) {
			const text = (h.querySelector(".fw-anchor") ? [...h.childNodes].filter((n) => !(n instanceof HTMLElement && n.classList.contains("fw-anchor"))).map((n) => n.textContent).join("") : h.textContent ?? "").trim();
			const base = slug(text);
			const n = seen.get(base) ?? 0;
			seen.set(base, n + 1);
			h.id = n ? `${base}-${n}` : base;
			list.push({ level: Number(h.tagName[1]), text, id: h.id });
			if (h.tagName !== "H1" && !h.querySelector(".fw-anchor")) {
				const a = document.createElement("a");
				a.className = "fw-anchor";
				a.href = `#${h.id}`;
				a.textContent = "#";
				a.setAttribute("aria-label", `Link to ${text}`);
				h.prepend(a);
			}
		}
		headings = list;
		// a Run button for a command this build does not have (the docs site): say where it runs
		for (const b of body.querySelectorAll<HTMLButtonElement>("button[data-run]:not([disabled])")) {
			if (k.commands.get(b.dataset.run!)) continue;
			b.disabled = true;
			b.textContent = "Desktop app";
			b.title = `${b.dataset.run} runs in the FaNWiT app, not on this website`;
		}
		if (bionic) applyBionic(body);
		highlightTerms();
		observer?.takeRecords();
		if (pendingAnchor) jumpTo(pendingAnchor);
		measure();
	}
	$effect(() => {
		if (!body) return;
		// widgets that change their own DOM all the time (editors, live files) are not page content
		const widget = (n: Node) => !!(n instanceof Element ? n : n.parentElement)?.closest(".fw-widget");
		const mo = new MutationObserver((records) => records.some((r) => !widget(r.target)) && schedule());
		observer = mo;
		mo.observe(body, { childList: true, subtree: true });
		schedule();
		return () => {
			mo.disconnect();
			observer = null;
			cancelAnimationFrame(scheduled);
			scheduled = 0;
		};
	});

	/** Bold the first part of each word in prose (not code). Done text is wrapped, so a second pass skips it. */
	function applyBionic(root: HTMLElement) {
		const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
			acceptNode: (n) => (n.parentElement?.closest("pre, code, kbd, .fw-bw, .fw-anchor, .fw-widget, h1, svg, button") || !n.textContent?.trim() ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT)
		});
		const nodes: Text[] = [];
		while (walker.nextNode()) nodes.push(walker.currentNode as Text);
		for (const t of nodes) {
			const frag = document.createDocumentFragment();
			for (const part of t.textContent!.split(/(\s+)/)) {
				const m = /^([\p{L}\p{N}][\p{L}\p{N}'’-]*)(.*)$/u.exec(part);
				if (!m) {
					frag.append(part);
					continue;
				}
				const n = m[1].length <= 3 ? 1 : Math.ceil(m[1].length * 0.45);
				const b = document.createElement("b");
				b.className = "fw-bionic";
				b.textContent = m[1].slice(0, n);
				frag.append(b, m[1].slice(n) + m[2]);
			}
			const done = document.createElement("span");
			done.className = "fw-bw";
			done.append(frag);
			t.replaceWith(done);
		}
		observer?.takeRecords();
	}
	// turning bionic off re-renders the page from its source
	let renderKey = $state(0);
	let wasBionic = k.sys.settings.get<boolean>("manual.bionic");
	$effect(() => {
		const b = bionic;
		if (b === wasBionic) return;
		wasBionic = b;
		if (b) body && applyBionic(body);
		else renderKey++;
	});

	/** Search terms as CSS highlights: no DOM changes, so nothing to undo. */
	function highlightTerms() {
		const H = (globalThis as unknown as { Highlight?: new (...r: Range[]) => unknown }).Highlight;
		const reg = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights;
		if (!H || !reg || !body) return;
		const terms = st.highlight?.key === key ? st.highlight.terms.filter((t) => t.length > 1).map((t) => t.toLowerCase()) : [];
		if (!terms.length) return void (active && reg.delete("fw-search"));
		const ranges: Range[] = [];
		const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
		while (walker.nextNode()) {
			const n = walker.currentNode as Text;
			const text = n.textContent!.toLowerCase();
			for (const t of terms) {
				for (let i = text.indexOf(t); i >= 0; i = text.indexOf(t, i + t.length)) {
					const r = new Range();
					r.setStart(n, i);
					r.setEnd(n, i + t.length);
					ranges.push(r);
				}
			}
		}
		reg.set("fw-search", new H(...ranges));
	}

	function jumpTo(anchor: string) {
		const el = body?.querySelector<HTMLElement>(`#${CSS.escape(anchor)}`);
		if (!el || !scroller) {
			pendingAnchor = anchor;
			return;
		}
		pendingAnchor = "";
		scroller.scrollTo({ top: offsetIn(el) - 12, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
	}
	$effect(() => {
		const j = st.jump;
		if (j && j.key === key) jumpTo(j.anchor);
	});

	/** Offset of an element within the scroller (offset sizes: stable while things animate). */
	function offsetIn(el: HTMLElement): number {
		let y = 0;
		for (let n: HTMLElement | null = el; n && n !== scroller; n = n.offsetParent as HTMLElement | null) y += n.offsetTop;
		return y;
	}

	// ----- what is on screen: outline highlights, progress, focus mode -----
	let frame = 0;
	function measure() {
		cancelAnimationFrame(frame);
		frame = requestAnimationFrame(() => {
			if (!scroller || !body) return;
			const top = scroller.scrollTop;
			const bottom = top + scroller.clientHeight;
			const hs = [...body.querySelectorAll<HTMLElement>("h2, h3, h4")];
			const tops = hs.map(offsetIn);
			const end = (i: number) => tops[i + 1] ?? scroller!.scrollHeight;
			const visible = hs.filter((_, i) => end(i) > top + 8 && tops[i] < bottom - 8).map((h) => h.id);
			const read = hs.filter((_, i) => end(i) <= top + 8).map((h) => h.id);
			const max = scroller.scrollHeight - scroller.clientHeight;
			if (active) st.outline = { pane: paneId, key, headings, visible, read, progress: max > 0 ? Math.min(1, top / max) : 1 };
			// read to the end: tick it off (learning paths, contents)
			if (active && page?.source === "written" && max > 0 && top / max >= 0.92) st.markRead(key);
			if (focusMode) {
				const line = top + scroller.clientHeight * 0.35;
				let current: Element | null = null;
				for (const el of body.children) {
					const y = offsetIn(el as HTMLElement);
					if (y <= line) current = el;
					else break;
				}
				for (const el of body.querySelectorAll(":scope > .fw-current")) if (el !== current) el.classList.remove("fw-current");
				current?.classList.add("fw-current");
			}
		});
	}
	$effect(() => {
		// re-measure when this page becomes the one the outline follows, or focus mode toggles
		void active;
		void focusMode;
		measure();
	});

	// ----- read aloud (Web Speech API; native, no download) -----
	const canSpeak = typeof speechSynthesis !== "undefined";
	function speak() {
		if (!canSpeak || !body || !scroller) return;
		if (speaking === "paused") {
			speechSynthesis.resume();
			speaking = "on";
			return;
		}
		if (speaking === "on") {
			speechSynthesis.pause();
			speaking = "paused";
			return;
		}
		const top = scroller.scrollTop;
		const blocks = [...body.querySelectorAll<HTMLElement>(":scope > :is(p, h1, h2, h3, h4, ul, ol, blockquote)")].filter((b) => offsetIn(b) + b.offsetHeight > top);
		speechSynthesis.cancel();
		speaking = "on";
		const next = (i: number) => {
			body?.querySelector(".fw-speaking")?.classList.remove("fw-speaking");
			const b = blocks[i];
			if (!b || speaking === "off") return stopSpeaking();
			b.classList.add("fw-speaking");
			b.scrollIntoView({ block: "nearest", behavior: "smooth" });
			const u = new SpeechSynthesisUtterance(b.innerText.replace(/^#\s*/, ""));
			u.rate = setting<number>("speechRate") || 1;
			u.lang = document.documentElement.lang || "en";
			u.onend = () => next(i + 1);
			u.onerror = () => stopSpeaking();
			speechSynthesis.speak(u);
		};
		next(0);
	}
	function stopSpeaking() {
		if (canSpeak) speechSynthesis.cancel();
		speaking = "off";
		body?.querySelector(".fw-speaking")?.classList.remove("fw-speaking");
	}
	$effect(() => () => speaking !== "off" && stopSpeaking());

	// ----- clicks: run buttons, copy, permalinks, links -----
	async function click(e: MouseEvent) {
		const t = e.target as HTMLElement;
		const replay = t.closest<HTMLElement>(".fw-figure-replay");
		if (replay) return void figures.get(replay.closest<HTMLElement>(".fw-tikz")!)?.replay();
		const zoom = t.closest<HTMLElement>(".fw-figure-zoom");
		if (zoom) {
			const figure = zoom.closest<HTMLElement>("[data-figure]")?.dataset.figure;
			return void k.sys.layout.dispatch({ type: "openOverlay", view: "manual.figure", variant: "lightbox", backdrop: "blur", props: { figure } }, { undoable: false });
		}
		const run = t.closest<HTMLElement>("[data-run]");
		if (run) {
			let args = {};
			try {
				args = JSON.parse(run.dataset.args || "{}");
			} catch {
				/* plain text args */
			}
			try {
				const r = await k.commands.run(run.dataset.run!, args, { source: "api", interactive: true });
				k.sys.notify.toast(r === undefined ? `Ran ${run.dataset.run}` : `${run.dataset.run} → ${JSON.stringify(r)}`, "success");
			} catch (err) {
				k.sys.notify.error(err);
			}
			return;
		}
		const copy = t.closest<HTMLElement>("[data-copy]");
		if (copy) {
			const code = copy.closest(".fw-code")?.querySelector("pre")?.textContent ?? "";
			await navigator.clipboard?.writeText(code).catch(() => {});
			copy.textContent = "Copied";
			copy.dataset.done = "";
			setTimeout(() => {
				copy.textContent = "Copy";
				delete copy.dataset.done;
			}, 1200);
			return;
		}
		const a = t.closest<HTMLAnchorElement>("a[href]");
		if (!a) return;
		const href = a.getAttribute("href")!;
		e.preventDefault();
		if (a.classList.contains("fw-anchor")) {
			jumpTo(href.slice(1));
			await navigator.clipboard?.writeText(`manual://${key}${href}`).catch(() => {});
			k.sys.notify.toast("Link to this section copied");
		} else if (href.startsWith("#")) jumpTo(href.slice(1));
		else if (/^https?:/.test(href)) void k.commands.run("shell.openExternal", { url: href });
		else st.open(href.replace(/\.md(#|$)/, "$1"), { from: page?.set, newTab: e.ctrlKey || e.metaKey || e.button === 1 });
	}

	// a page too short to scroll counts as read after a few seconds on screen
	$effect(() => {
		if (!active || page?.source !== "written" || !scroller) return;
		const k2 = key;
		const t = setTimeout(() => scroller && scroller.scrollHeight <= scroller.clientHeight + 8 && st.markRead(k2), 5000);
		return () => clearTimeout(t);
	});
	const inPaths = $derived(page ? st.pathsOf(page.key) : []);

	const editUrl = $derived(set?.edit && page?.file ? `${set.edit}${page.file.slice(1)}` : undefined);
	const near = $derived(page ? st.neighbours(page.key) : {});
</script>

<div bind:this={scroller} class="fw-doc selectable relative h-full overflow-auto" data-focus={focusMode || undefined} onscroll={measure} onpointermove={(e) => ruler && scroller && (rulerY = e.clientY - scroller.getBoundingClientRect().top + scroller.scrollTop)} onpointerleave={() => (rulerY = null)} role="presentation">
	{#if ruler && rulerY !== null}<div class="fw-ruler" style:top="{rulerY}px"></div>{/if}
	{#if !docsets.length}
		<EmptyState icon="book-x" title="No documentation in this build" description="Production builds include only docsets with ship = &quot;prod&quot; in their docset.toml." />
	{:else if !page && /\/api\//.test(key) && (st.apiState === "idle" || st.apiState === "loading")}
		<EmptyState icon="loader" title="Reading the API from the source" description="TypeDoc runs once per session in development." />
	{:else if !page}
		<EmptyState icon="file-question" title="Page not found" description={`There is no page "${key}" in this build.`}>
			<button class="fw-btn" onclick={() => st.open(st.home() ?? "")}>Go to the start</button>
			<button class="fw-btn" onclick={() => (st.searchRequest = { query: key.split("/").pop() ?? "", n: Date.now() })}>Search for it</button>
		</EmptyState>
	{:else}
		<div class="mx-auto flex w-full max-w-[calc(var(--doc-measure,72ch)+6rem)] flex-col px-6 pt-5 pb-16 sm:px-12" style:font-size="var(--doc-size, 16px)">
			{#if st.versions && siteVersion !== st.versions.latest}
				<div class="mb-4 flex flex-wrap items-center gap-2 rounded-md border border-warning/40 bg-warning-muted px-3 py-2 font-sans text-[13px]" role="status">
					<Icon name="history" size={14} />
					<span>{siteVersion === "next" ? "These docs are for the next, unreleased version." : `You are reading the docs for v${siteVersion}.`} The latest release is v{st.versions.latest}.</span>
					<button class="ml-auto font-medium underline" onclick={() => st.switchVersion(st.versions!.latest)}>Go to v{st.versions.latest}</button>
				</div>
			{/if}
			<header class="mb-5 flex flex-wrap items-center gap-x-2 gap-y-1 font-sans text-xs text-muted-foreground">
				<span>{set?.title}</span>
				<Icon name="chevron-right" size={12} />
				<span>{page.section}</span>
				{#if page.kind === "reference"}<span class="rounded-full border border-border px-2 py-px">Reference</span>{/if}
				{#if page.source !== "written"}<span class="rounded-full border border-border px-2 py-px" title="Built from the running app or the source, so it is never out of date">Generated</span>{/if}
				{#if page.since}<span class="rounded-full bg-primary/10 px-2 py-px text-primary">Since {page.since}</span>{/if}
				<span class="ml-auto flex items-center gap-1">
					{#if page.source === "written"}<span title="Reading time">{readingMinutes(page)} min read</span>{/if}
					{#if canSpeak && page.source === "written"}
						<button class="fw-icon-btn" title={speaking === "on" ? "Pause reading aloud" : "Read aloud from here"} aria-label={speaking === "on" ? "Pause reading aloud" : "Read aloud"} onclick={speak}><Icon name={speaking === "on" ? "pause" : "volume-2"} size={14} /></button>
						{#if speaking !== "off"}<button class="fw-icon-btn" title="Stop reading" aria-label="Stop reading" onclick={stopSpeaking}><Icon name="square" size={13} /></button>{/if}
					{/if}
					{#if page.source === "written"}
						{@const isRead = st.read.has(page.key)}
						<button class="fw-icon-btn" title={isRead ? "Read: click to mark unread" : "Mark as read"} aria-label={isRead ? "Mark as unread" : "Mark as read"} aria-pressed={isRead} onclick={() => st.markRead(page.key, !isRead)}><Icon name={isRead ? "circle-check" : "circle"} size={14} class={isRead ? "text-success" : ""} /></button>
					{/if}
					{#if editUrl}<button class="fw-icon-btn" title="Edit this page" aria-label="Edit this page" onclick={() => k.commands.run("shell.openExternal", { url: editUrl })}><Icon name="pencil" size={13} /></button>{/if}
				</span>
			</header>

			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<article bind:this={body} class="fw-doc-body" onclick={click} onauxclick={click} role="presentation">
				{#key renderKey}
					{#if page.source === "written"}
						{#if Comp}
							<Comp />
						{:else if status === "error"}
							<EmptyState icon="triangle-alert" title="This page failed to load" description={error}>
								<button class="fw-btn" onclick={() => location.reload()}>Reload</button>
							</EmptyState>
						{:else}
							<div class="flex flex-col gap-3 pt-2" aria-busy="true" aria-label="Loading page">
								<div class="h-8 w-2/3 animate-pulse rounded bg-muted"></div>
								<div class="h-4 w-full animate-pulse rounded bg-muted"></div>
								<div class="h-4 w-5/6 animate-pulse rounded bg-muted"></div>
							</div>
						{/if}
					{:else if page.source === "paths"}
						<LearningPaths set={page.set} />
					{:else if page.source === "api" && page.symbol}
						<ApiSymbolView symbol={page.symbol} />
					{:else}
						{@html generated}
					{/if}
				{/key}
			</article>

			{#each inPaths as ip (ip.path.id)}
				<nav class="fw-path-next" aria-label="Learning path {ip.path.title}" style:max-width="var(--doc-measure, 72ch)">
					<Icon name="route" size={15} />
					<span><strong>{ip.path.title}</strong> · step {ip.index + 1} of {ip.path.pages.length}</span>
					{#if ip.next}
						<button class="ml-auto font-medium text-primary hover:underline" onclick={() => st.open(ip.next!)}>Next: {titleOf(ip.next)} →</button>
					{:else}
						<button class="ml-auto font-medium text-primary hover:underline" onclick={() => st.open(`${page.set}/learn`)}>Path complete: see all paths</button>
					{/if}
				</nav>
			{/each}
			{#if near.prev || near.next}
				<nav class="mt-14 grid grid-cols-2 gap-3 font-sans text-sm" aria-label="Previous and next pages" style:max-width="var(--doc-measure, 72ch)">
					{#if near.prev}
						<button class="flex flex-col items-start rounded-lg border border-border px-4 py-3 text-left hover:border-primary" onclick={() => st.open(near.prev!.key)}><span class="text-xs text-muted-foreground">Previous</span><span class="font-medium">{near.prev.title}</span></button>
					{:else}<span></span>{/if}
					{#if near.next}
						<button class="col-start-2 flex flex-col items-end rounded-lg border border-border px-4 py-3 text-right hover:border-primary" onclick={() => st.open(near.next!.key)}><span class="text-xs text-muted-foreground">Next</span><span class="font-medium">{near.next.title}</span></button>
					{/if}
				</nav>
			{/if}
		</div>
	{/if}
</div>
