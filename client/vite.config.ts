import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig(({ mode }) => ({
  root: path.resolve(__dirname),
  server: {
    host: "0.0.0.0",
    port: 8080,
    proxy: {
      "/api": {
        target: process.env.VITE_SERVER_URL || "http://localhost:3000",
        changeOrigin: true,
      },
      "/socket.io": {
        target: process.env.VITE_SOCKET_URL || "ws://localhost:3000",
        ws: true,
      },
    },
  },
  build: {
    outDir: "../dist/spa",
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "../client"),
      "@shared": path.resolve(__dirname, "../shared"),
    },
  },
}));
