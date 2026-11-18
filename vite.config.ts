import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	root: "web",
	plugins: [react(), tailwindcss()],
	build: {
		// The makefiles expect the build in this directory. It is relative to
		// the root, which is the "web" directory.
		outDir: "../artifacts/vite/dist",
		emptyOutDir: true,
	},
});
