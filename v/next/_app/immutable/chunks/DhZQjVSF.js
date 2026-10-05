const o=`# A feature plugin with widget UI: the worker sends a widget tree, the app draws it.
id = "pomodoro"
name = "Pomodoro"
version = "1.0.0"
author = "Fanwit"
description = "A focus timer in the sidebar, drawn with the app's own widgets from a worker."
category = "productivity"
icon = "timer"
entry = "main.js"
permissions = ["statusbar"]

[[contributes.views]]
id = "pomodoro.panel"
title = "Pomodoro"
icon = "timer"
ui = "widgets"
regions = ["sidebar"]

[[contributes.commands]]
id = "pomodoro.toggle"
title = "Start or pause the focus timer"
category = "Pomodoro"
icon = "timer"

[[contributes.commands]]
id = "pomodoro.reset"
title = "Reset the focus timer"
category = "Pomodoro"
icon = "rotate-ccw"

[[contributes.commands]]
id = "pomodoro.open"
title = "Open the Pomodoro panel"
category = "Pomodoro"
icon = "timer"

[[contributes.commands]]
id = "pomodoro.length"
title = "Focus length"
category = "Pomodoro"
palette = false

# Right click the timer in the status bar (it shows while a session runs)
[[contributes.menus."statusbar/item"]]
command = "pomodoro.toggle"
label = "Start or pause"
group = "1_pomodoro"
visibleWhen = "statusItem == 'pomodoro.status'"

[[contributes.menus."statusbar/item"]]
command = "pomodoro.reset"
group = "1_pomodoro"
visibleWhen = "statusItem == 'pomodoro.status'"

[[contributes.menus."statusbar/item"]]
command = "pomodoro.length"
label = "Focus for 15 minutes"
args = { minutes = 15 }
group = "2_pomodoro"
visibleWhen = "statusItem == 'pomodoro.status'"

[[contributes.menus."statusbar/item"]]
command = "pomodoro.length"
label = "Focus for 25 minutes"
args = { minutes = 25 }
group = "2_pomodoro"
visibleWhen = "statusItem == 'pomodoro.status'"

[[contributes.menus."statusbar/item"]]
command = "pomodoro.length"
label = "Focus for 50 minutes"
args = { minutes = 50 }
group = "2_pomodoro"
visibleWhen = "statusItem == 'pomodoro.status'"

[[contributes.menus."statusbar/item"]]
command = "pomodoro.open"
group = "3_pomodoro"
visibleWhen = "statusItem == 'pomodoro.status'"

# and in the panel's own title bar
[[contributes.menus."view/title"]]
command = "pomodoro.reset"
group = "navigation"
visibleWhen = "focusedView == 'pomodoro.panel'"

[[contributes.settings]]
key = "pomodoro.minutes"
type = "number"
default = 25
title = "Focus length (minutes)"
`;export{o as default};
