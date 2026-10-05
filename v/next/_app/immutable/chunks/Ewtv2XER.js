const n=`# A native sidecar plugin: plugins/sys-info/native builds the program fanwit-plugin-sys-info,
# which the app runs as its own process (desktop only, bundled plugins only, asks first).
id = "sys-info"
name = "System Info"
version = "1.0.0"
author = "Fanwit"
description = "System details and a multi-core benchmark from a native Rust process."
category = "developer"
icon = "cpu"
runtime = "sidecar"
entry = "native"
permissions = ["sidecar:sys-info"]

[[contributes.views]]
id = "sysInfo.panel"
title = "System Info"
icon = "cpu"
ui = "widgets"
regions = ["sidebar", "panel"]

[[contributes.commands]]
id = "sysInfo.show"
title = "Show system info"
category = "System Info"

[[contributes.commands]]
id = "sysInfo.bench"
title = "Run the native benchmark"
category = "System Info"
icon = "cpu"

[[contributes.menus."view/title"]]
command = "sysInfo.bench"
group = "navigation"
visibleWhen = "focusedView == 'sysInfo.panel'"
`;export{n as default};
