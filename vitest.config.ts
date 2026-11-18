import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.ts";

export default mergeConfig(
	viteConfig,
	defineConfig({
		// The frontend builds from the "web" directory, but the tests run from the
		// project root so that their caches and reports go in the project's
		// ignored directories.
		root: ".",
		test: {
			environment: "jsdom",
			include: ["web/**/*.test.{ts,tsx}"],
		},
	}),
);
