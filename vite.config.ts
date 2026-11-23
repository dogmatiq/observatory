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

/**
 * The parts of Node's file system module that {@link reviewDecisions} uses, which
 * this project has no types for.
 */
interface FileSystem {
	existsSync(path: string): boolean;
	mkdirSync(path: string, options: { recursive: boolean }): void;
	readFileSync(path: string, encoding: "utf8"): string;
	writeFileSync(path: string, data: string): void;
}

/** A request to the dev server, as {@link reviewDecisions} reads it. */
interface DevRequest {
	method?: string;
	on(event: "data", listener: (chunk: unknown) => void): void;
	on(event: "end", listener: () => void): void;
}

/** A response of the dev server, as {@link reviewDecisions} writes it. */
interface DevResponse {
	statusCode: number;
	setHeader(name: string, value: string): void;
	end(body?: string): void;
}

/**
 * The file in which the decisions made on the review page are kept, which the
 * agent that the review is with reads. It is in the artifacts, which git ignores.
 */
const decisionsFile = "artifacts/review/decisions.json";

/**
 * reviewDecisions is a plugin of the dev server that keeps the decisions made on
 * the review page, `/review`, in {@link decisionsFile}. GET `/__review/decisions`
 * returns them, and POST adds one, which is a JSON object with the ID of what was
 * decided, the decision, and the recommendation that was accepted, if one was. It
 * is only in the dev server: the Observatory itself has no review page.
 */
function reviewDecisions() {
	return {
		name: "review-decisions",
		async configureServer(server: {
			middlewares: {
				use(
					path: string,
					handler: (req: DevRequest, res: DevResponse) => void,
				): void;
			};
		}) {
			const fs = (await import("node:fs" as string)) as FileSystem;

			const read = (): unknown[] =>
				fs.existsSync(decisionsFile)
					? JSON.parse(fs.readFileSync(decisionsFile, "utf8"))
					: [];

			server.middlewares.use("/__review/decisions", (req, res) => {
				res.setHeader("Content-Type", "application/json");

				if (req.method !== "POST") {
					res.end(JSON.stringify(read()));
					return;
				}

				let body = "";
				req.on("data", (chunk) => {
					body += String(chunk);
				});
				req.on("end", () => {
					const decision = {
						...JSON.parse(body),
						at: new Date().toISOString(),
					};
					const decisions = [...read(), decision];
					fs.mkdirSync("artifacts/review", { recursive: true });
					fs.writeFileSync(
						decisionsFile,
						JSON.stringify(decisions, null, "\t"),
					);
					res.end(JSON.stringify(decisions));
				});
			});
		},
	};
}

export default defineConfig({
	root: "web",
	plugins: [react(), tailwindcss(), reviewDecisions()],
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
