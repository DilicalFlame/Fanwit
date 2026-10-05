const n=`# System Info

System details plus a benchmark that counts primes on every CPU core, all run by a native Rust program in its own process (\`native/src/main.rs\`).

A sidecar is the right choice when a plugin needs something the browser sandbox can't give it: native libraries, real threads, the GPU, or existing command line tools. It talks to the app with the same messages as a worker plugin, as JSON lines on stdin and stdout, so the widgets panel and commands work the same way.

Because a sidecar runs native code with your user's rights:

- it only runs when it ships with the app (built-in plugins);
- it only runs in the desktop app;
- the app asks before the first run.

Build it (\`pnpm fw dev\` and \`pnpm fw build\` do this for you):

\`\`\`sh
pnpm fw plugin build sys-info
\`\`\`
`;export{n as default};
