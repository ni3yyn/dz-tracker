#!/usr/bin/env node
// Backward-compatible entry point for the benchmark workflow.
process.argv.splice(2, 0, 'run');
await import('./benchmark.mjs');
