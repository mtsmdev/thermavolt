import { defineConfig } from "vite";
import laravel from "laravel-vite-plugin";
import { svelte } from "@sveltejs/vite-plugin-svelte";
export default defineConfig({
    plugins: [
        laravel({ input: ["resources/js/app.ts"], refresh: true }),
        svelte(),
    ],
    build: { chunkSizeWarningLimit: 750 },
});
