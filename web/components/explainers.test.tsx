import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test } from "vitest";
import { application, overview } from "../fixtures/overview.ts";
import { euWest, siteApplications } from "../fixtures/site.ts";
import { ExampleData } from "../lib/distrust.tsx";
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

test("the cluster explainer's copy shows its member with no signal, with its workloads sharp and no flag", () => {
	const spec = cardExplainers(application).cluster;

	const { container } = render(<ExampleData>{spec.card}</ExampleData>);

	expect(screen.getByRole("article").textContent).toMatch(/^3\+1/);
	expect(container.querySelector(".distrust-blur")).toBeNull();
	expect(
		container.querySelector(".text-fg-soft svg, .text-bad svg"),
	).toBeNull();
});
