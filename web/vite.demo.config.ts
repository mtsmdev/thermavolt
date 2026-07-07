import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { cpSync, copyFileSync } from "node:fs";
import { resolve } from "node:path";

const output = resolve("dist/demo");

export default defineConfig({
    root: "demo",
    base: "/thermavolt/",
    publicDir: false,
    plugins: [
        svelte(),
        {
            name: "copy-demo-images",
            closeBundle() {
                cpSync("public/images", resolve(output, "images"), { recursive: true });
                copyFileSync("public/favicon.svg", resolve(output, "favicon.svg"));
            },
        },
    ],
    define: {
        "import.meta.env.VITE_STATIC_DEMO": JSON.stringify("true"),
    },
    build: {
        outDir: "../dist/demo",
        emptyOutDir: true,
        chunkSizeWarningLimit: 750,
    },
});
