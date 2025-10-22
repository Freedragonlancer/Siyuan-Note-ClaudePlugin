import { defineConfig } from "vite";
import { resolve } from "path";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { viteStaticCopy } from "vite-plugin-static-copy";

export default defineConfig({
    resolve: {
        alias: {
            "@": resolve(__dirname, "src"),
        }
    },
    plugins: [
        svelte(),
        viteStaticCopy({
            targets: [
                { src: "README*.md", dest: "./" },
                { src: "plugin.json", dest: "./" },
                { src: "preview.png", dest: "./" },
                { src: "icon.png", dest: "./" }
            ]
        })
    ],
    define: {
        "process.env.DEV_MODE": `"${process.env.DEV_MODE}"`,
    },
    build: {
        outDir: "dist",
        emptyOutDir: false,
        minify: true,
        sourcemap: process.env.DEV_MODE === "true" ? "inline" : false,
        lib: {
            entry: resolve(__dirname, "src/index.ts"),
            fileName: "index",
            formats: ["cjs"],
        },
        rollupOptions: {
            external: ["siyuan", "process"],
            output: {
                entryFileNames: "[name].js",
                assetFileNames: (assetInfo) => {
                    if (assetInfo.name === "style.css") {
                        return "index.css";
                    }
                    return assetInfo.name;
                },
            },
        },
    }
});
