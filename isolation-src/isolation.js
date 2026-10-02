// Isolation hook (Section 22.2): every IPC message from the app passes through here, inside a
// sandboxed iframe the main frontend cannot reach. Reject unknown commands and oversized
// payloads before they ever reach Rust.
const MAX_BYTES = 16 * 1024 * 1024;
const ALLOWED = [/^fw_[a-z_]+$/, /^plugin:[a-z0-9-]+\|[a-z0-9_-]+$/];

window.__TAURI_ISOLATION_HOOK__ = (payload) => {
    const cmd = payload && payload.cmd;
    if (typeof cmd !== "string" || !ALLOWED.some((re) => re.test(cmd))) {
        throw new Error(`IPC command rejected by the isolation hook: ${String(cmd)}`);
    }
    try {
        if (JSON.stringify(payload.payload ?? null).length > MAX_BYTES) {
            throw new Error(`IPC payload for ${cmd} exceeds ${MAX_BYTES} bytes`);
        }
    } catch (e) {
        if (String(e.message).includes("exceeds")) throw e;
        // non-serialisable payloads (raw binary) pass through unchanged
    }
    return payload;
};
