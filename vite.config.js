import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/ParTrabaho/",
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("react-router")) return "router";
          if (id.includes("react-query") || id.includes("@tanstack")) return "query";
          if (id.includes("@supabase")) return "supabase";
          if (id.includes("react") || id.includes("react-dom")) return "react-vendor";
          return "vendor";
        }
      }
    }
  },
  server: {
    port: 5173
  }
});
