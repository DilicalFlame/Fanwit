window.__TAURI_ISOLATION_HOOK__ = (payload) => {
    // The 'payload' is the IPC message coming from your main frontend.
    // add cryptography, validation, or logging here.

    // return the payload, otherwise the IPC call will hang forever.
    return payload;
};
