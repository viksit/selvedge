// This file is needed because Bun doesn't natively bundle node_modules for browser. We'll use unpkg CDN for Monaco.
// This shim will be referenced in index.html for now.
export default window.monaco;
