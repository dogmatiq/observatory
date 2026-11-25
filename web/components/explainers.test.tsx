import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test } from "vitest";
import { application, overview } from "../fixtures/overview.ts";
import { euWest, siteApplications } from "../fixtures/site.ts";
import type { HandlerData, SiteApplication } from "../model.ts";
import { stubBrowser } from "../test-support.ts";
import {
	cardExplainers,
	compactExplainer,
	handlerExplainer,
} from "./explainers.tsx";

beforeEach(stubBrowser);
afterEach(cleanup);

test("a handler digest's explainer draws its copy with the handler's name", () => {
	const handler = {
		...(overview.handlers[0] as HandlerData),
		name: "ledger-entries",
	};
	const spec = handlerExplainer(
		cardExplainers(application),
		application,
		handler,
	);

	render(<>{spec.card}</>);

	expect(screen.getByRole("article").textContent).toContain("ledger");
	expect(screen.getByRole("article").textContent).toContain("entries");
});

test("a compact digest's explainer draws its copy with the application's name", () => {
	const app: SiteApplication = {
		...(siteApplications[0] as SiteApplication),
		application: { name: "ledger", key: "k" },
	};
	const spec = compactExplainer(cardExplainers(application), app, euWest);

	render(<>{spec.card}</>);

	expect(screen.getByRole("article", { name: /ledger/ })).toBeDefined();
});
