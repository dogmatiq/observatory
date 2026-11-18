import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * The part of the dev server's proxy that {@link closeStreamsOfLostServer}
 * uses. Vite's own types for it need Node's, which this project doesn't have.
 */
interface Proxy {
	on(
		event: "proxyRes",
		listener: (
			proxyRes: { on(event: "close", listener: () => void): void },
			req: unknown,
			res: { writableEnded: boolean; destroy(): void },
		) => void,
	): void;
}

/**
 * The proxy leaves a stream of server-sent events open when the server behind
 * it goes away. Closing the stream tells the page, as a server without a proxy
 * would.
 */
function closeStreamsOfLostServer(proxy: unknown) {
	(proxy as Proxy).on("proxyRes", (proxyRes, _req, res) => {
		proxyRes.on("close", () => {
			if (!res.writableEnded) {
				res.destroy();
			}
		});
	});
}

export default defineConfig({
	root: "web",
	plugins: [react(), tailwindcss()],
	server: {
		// The Observatory's Go server answers the page's requests for data. In
		// development the page is served by Vite instead, so it forwards them.
		proxy: {
			"/api": {
				target: "http://localhost:8080",
				configure: (proxy) => closeStreamsOfLostServer(proxy),
			},
		},
	},
	build: {
		// The makefiles expect the build in this directory. It is relative to
		// the root, which is the "web" directory.
		outDir: "../artifacts/vite/dist",
		emptyOutDir: true,
	},
});
