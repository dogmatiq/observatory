import { Page } from "./Page.tsx";

/**
 * Message is a page that says one thing, such as that a page isn't there.
 */
export function Message({
	title,
	children,
}: {
	title: string;
	children?: string;
}) {
	return (
		<Page>
			<h2 className="mb-2 text-lg font-semibold">{title}</h2>
			{children && <p className="text-muted">{children}</p>}
			<p className="mt-4">
				<a href="/">Go to the clusters</a>
			</p>
		</Page>
	);
}
