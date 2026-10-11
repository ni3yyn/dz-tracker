import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts','src/cli.ts'], // أضفنا cli.ts هنا  
  format: ['cjs', 'esm'],
  dts: false, // نلغي دمج الـ types عبر rollup القديم
  clean: false,
  minify: true,
  sourcemap: true,
});