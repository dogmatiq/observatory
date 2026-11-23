import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { NodesCard, WorkloadsCard } from "./ClusterCards.tsx";

afterEach(cleanup);

test("the card of the nodes says what a node and a cluster are", () => {
	const { container } = render(<NodesCard live={3} />);
	const text = container.textContent;

	expect(text).toContain("Cluster nodes");
	expect(text).toContain(
		"The number of nodes that are in contact now. A node is one running process of the application's engine. Together, the nodes form a cluster that shares the application's work.",
	);
	expect(text).not.toContain("believes");
	expect(text).not.toContain("is offline");
});

test("the card of the nodes says that contact has been lost when no node is live", () => {
	const { container } = render(<NodesCard live={0} />);

	expect(container.textContent).toContain(
		"Every node is out of contact, so it's unknown whether the application is working.",
	);
});

test("the card of the workloads says what a workload is, and leaves the bar to the cards of its segments", () => {
	const { container } = render(<WorkloadsCard whole />);
	const text = container.textContent;

	expect(text).toContain(
		"A workload is an ongoing task that the cluster gives to one of its nodes",
	);
	expect(text).not.toContain("bar");
	expect(text).not.toContain("Observatory");
	expect(text).not.toContain("doesn't divide its work");
});

test("the card of the workloads says, as a status, when the total is unknown", () => {
	const { container } = render(<WorkloadsCard whole={false} />);

	expect(container.textContent).toContain(
		"Only some of the cluster's nodes report their workloads, so the total counts only the workloads of those nodes.",
	);
});
