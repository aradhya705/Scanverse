import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
    server: {
        host: true,
        port: 5173,
        proxy: {
            "/api": {
                target: process.env.VITE_API_PROXY_TARGET || "http://backend:8000",
                changeOrigin: true,
            },
            "/media": {
                target: process.env.VITE_API_PROXY_TARGET || "http://backend:8000",
                changeOrigin: true,
            },
        },
    },
    preview: {
        host: true,
        port: 4173,
    },
});
