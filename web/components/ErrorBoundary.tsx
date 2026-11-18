import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * UnableToRead says that a part of the page failed, and why. It takes the place
 * of the part, so that the rest of the page still works.
 */
export function UnableToRead({ error }: { error: unknown }) {
	const message = error instanceof Error ? error.message : String(error);

	return (
		<div
			role="alert"
			className="mb-3.5 rounded-lg bg-bad-soft px-3.5 py-2.5 wrap-anywhere text-bad"
		>
			<strong>Unable to read this.</strong> <code>{message}</code>
		</div>
	);
}

interface Props {
	children: ReactNode;
}

interface State {
	failure: { error: unknown } | undefined;
}

/**
 * ErrorBoundary contains a failure in its children, so that the part of the page
 * that it wraps shows what failed, and the rest of the page does not go with it.
 *
 * Each part of a page that can fail on its own, such as a tile or a handler's
 * card, has a boundary of its own.
 */
export class ErrorBoundary extends Component<Props, State> {
	state: State = { failure: undefined };

	static getDerivedStateFromError(error: unknown): State {
		return { failure: { error } };
	}

	componentDidCatch(error: unknown, info: ErrorInfo) {
		console.error("a part of the page failed:", error, info.componentStack);
	}

	render() {
		const { failure } = this.state;

		if (failure === undefined) {
			return this.props.children;
		}

		return <UnableToRead error={failure.error} />;
	}
}
