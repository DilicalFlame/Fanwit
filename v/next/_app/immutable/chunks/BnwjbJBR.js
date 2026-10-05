const t=`<!doctype html>
<html>
	<head>
		<meta charset="utf-8" />
		<link rel="stylesheet" href="ui.css" />
		<script src="_fw/ui.js"><\/script>
	</head>
	<body>
		<div class="bar">
			<button data-color="currentColor" class="on" aria-label="Ink"></button>
			<button data-color="#ef4444" aria-label="Red"></button>
			<button data-color="#3b82f6" aria-label="Blue"></button>
			<button data-color="#22c55e" aria-label="Green"></button>
			<span class="grow"></span>
			<button id="clear">Clear</button>
		</div>
		<canvas id="c" aria-label="Drawing canvas"></canvas>
		<script src="ui.js"><\/script>
	</body>
</html>
`;export{t as default};
