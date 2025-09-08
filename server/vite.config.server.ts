import { defineConfig } from "vite";
import path from "path";

// Server build configuration
export default defineConfig({
  build: {
    lib: {
      entry: path.resolve(__dirname, "./node-build.ts"),
      name: "server",
      fileName: "production",
      formats: ["es"],
    },
    outDir: "../dist/server",
    target: "node22",
    ssr: true,
    rollupOptions: {
      external: [
        // Node.js built-ins
        "node:fs",
        "node:path",
        "node:url",
        "node:http",
        "node:https",
        "node:os",
        "node:crypto",
        "node:stream",
        "node:util",
        "node:events",
        "node:buffer",
        "node:querystring",
        "node:child_process",
        // External dependencies
        "fastify",
        "@fastify/static",
        "fastify-cors"
      ],
      output: {
        format: "es",
        entryFileNames: "[name].mjs",
      },
    },
    minify: false, // Keep readable for debugging
    sourcemap: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "../client"),
      "@shared": path.resolve(__dirname, "../shared"),
    },
  },
  define: {
    "process.env.NODE_ENV": '"production"',
  },
});
