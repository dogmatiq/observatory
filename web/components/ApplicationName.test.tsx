import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { ApplicationName } from "./ApplicationName.tsx";

afterEach(cleanup);

test("an application is named with the word application, and its site if it is at one", () => {
	const named = { name: "statements", key: "k" };

	const without = render(<ApplicationName application={named} />);
	expect(without.container.textContent).toBe("statements application");
	without.unmount();

	const at = render(
		<ApplicationName application={{ ...named, site: "eu-west" }} />,
	);
	expect(at.container.textContent).toBe(
		"statements application at the eu-west site",
	);
});
