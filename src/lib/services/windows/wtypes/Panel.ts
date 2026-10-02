// if application then spawn window
// think panel, aux and child windows

// three panels: panel, child and aux
// panel:
// - always on top
// - can allow focus to parent
// - no trace on taskbar
// child:
// - always on top
// - cannot allow focus to parent
// - no trace on taskbar
// aux:
// - not always on top
// - can allow focus
// - has trace on taskbar

import { Window } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow"


