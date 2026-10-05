const n=`# A feature plugin with its own page: any HTML, CSS and JS, in a sandboxed iframe.
id = "sketch-pad"
name = "Sketch Pad"
version = "1.0.0"
author = "Fanwit"
description = "A freehand drawing canvas: the plugin's own web page in a sandboxed frame."
category = "productivity"
icon = "pen-tool"
entry = "main.js"

[[contributes.views]]
id = "sketchPad.canvas"
title = "Sketch Pad"
icon = "pen-tool"
ui = "iframe"
entry = "ui.html"

[[contributes.commands]]
id = "sketchPad.clear"
title = "Clear the sketch"
category = "Sketch Pad"
icon = "eraser"

# a button in the view's title bar
[[contributes.menus."view/title"]]
command = "sketchPad.clear"
group = "navigation"
visibleWhen = "focusedView == 'sketchPad.canvas'"
`;export{n as default};
