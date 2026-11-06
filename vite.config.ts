import { defineConfig } from "vite";

// Relative base so the build works from any folder or static host.
export default defineConfig({
  base: "./",
  // A fixed port: 5173 is often taken by another project, and 5190 by Chaos Lab.
  server: { port: 5191, strictPort: true },
});
