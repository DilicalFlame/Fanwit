<script lang="ts">
	import { getKernel } from "../../ui.svelte";
	import { Button } from "$lib/components/ui/button/index.js";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import { Switch } from "$lib/components/ui/switch/index.js";
	import { Slider } from "$lib/components/ui/slider/index.js";
	import { Checkbox } from "$lib/components/ui/checkbox/index.js";
	import { Progress } from "$lib/components/ui/progress/index.js";
	import { Skeleton } from "$lib/components/ui/skeleton/index.js";
	import * as Tabs from "$lib/components/ui/tabs/index.js";
	import * as Card from "$lib/components/ui/card/index.js";
	import KeyChip from "../../workbench/KeyChip.svelte";
	import EmptyState from "../../workbench/EmptyState.svelte";
	import ErrorCard from "../../workbench/ErrorCard.svelte";

	/** Component Gallery: shadcn-svelte components and workbench components in the active theme. */
	const k = getKernel();
	let on = $state(true);
	let value = $state([40]);
</script>

<div class="h-full overflow-auto p-6">
	<div class="grid gap-6 md:grid-cols-2">
		<Card.Root>
			<Card.Header><Card.Title>Buttons and badges</Card.Title><Card.Description>shadcn-svelte, owned source in src/lib/components/ui</Card.Description></Card.Header>
			<Card.Content class="flex flex-wrap gap-2">
				<Button>Primary</Button><Button variant="secondary">Secondary</Button><Button variant="outline">Outline</Button><Button variant="destructive">Delete</Button><Button variant="ghost">Ghost</Button>
				<Badge>Badge</Badge><Badge variant="secondary">Secondary</Badge><Badge variant="outline">Outline</Badge>
			</Card.Content>
		</Card.Root>
		<Card.Root>
			<Card.Header><Card.Title>Inputs</Card.Title></Card.Header>
			<Card.Content class="flex flex-col gap-3">
				<Input placeholder="Text input" />
				<div class="flex items-center gap-3"><Switch bind:checked={on} /> <Checkbox checked /> <span class="text-sm">{on ? "On" : "Off"}</span></div>
				<Slider type="multiple" bind:value max={100} />
				<Progress value={value[0]} />
			</Card.Content>
		</Card.Root>
		<Card.Root>
			<Card.Header><Card.Title>Tabs and skeletons</Card.Title></Card.Header>
			<Card.Content>
				<Tabs.Root value="a"><Tabs.List><Tabs.Trigger value="a">User</Tabs.Trigger><Tabs.Trigger value="b">Vault</Tabs.Trigger></Tabs.List><Tabs.Content value="a" class="p-2 text-sm">User scope</Tabs.Content><Tabs.Content value="b" class="p-2 text-sm">Vault scope</Tabs.Content></Tabs.Root>
				<div class="mt-3 flex flex-col gap-2"><Skeleton class="h-4 w-2/3" /><Skeleton class="h-4 w-1/2" /></div>
			</Card.Content>
		</Card.Root>
		<Card.Root>
			<Card.Header><Card.Title>Workbench components</Card.Title><Card.Description>src/fanwit/workbench</Card.Description></Card.Header>
			<Card.Content class="flex flex-col gap-3">
				<div class="flex items-center gap-2 text-sm">KeyChip <KeyChip keys={k.keys.label("palette.open")} /></div>
				<div class="rounded border border-border"><EmptyState icon="inbox" title="Empty state" description="Explains what will appear and offers the first action." /></div>
				<ErrorCard error={new Error("Example of a recoverable error card")} title="Error card" reset={() => {}} />
			</Card.Content>
		</Card.Root>
	</div>
</div>
