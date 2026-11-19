import { ClusterPage } from "./components/ClusterPage.tsx";
import { ClustersPage } from "./components/ClustersPage.tsx";
import { Message } from "./components/Message.tsx";
import { Page } from "./components/Page.tsx";
import { StatesPage } from "./components/StatesPage.tsx";
import { VitalsPage } from "./components/VitalsPage.tsx";
import { application, overview } from "./fixtures/overview.ts";
import { fetchClusters } from "./lib/api.ts";
import { LiveData } from "./lib/live.tsx";
import { usePolled } from "./lib/poll.ts";
import { routeOf } from "./lib/route.ts";
import { useWatched } from "./lib/watch.ts";

/**
 * The line above a page that has stopped being updated, because the
 * Observatory can't be reached.
 */
const staleNotice =
	"Updates have stopped, because the Observatory can't be reached. This is the last data that it sent.";

/**
 * App is the root component of the user interface. It shows the page that the
 * address of the document is for.
 */
export function App({ path = window.location.pathname }: { path?: string }) {
	const route = routeOf(path);

	switch (route.page) {
		case "clusters":
			return <Clusters />;

		case "cluster":
			return <Cluster id={route.id} />;

		case "fixture":
			// What the prototype's overview showed. It is static, and it is how the
			// cluster view is compared with the prototype.
			return <ClusterPage application={application} data={overview} />;

		case "states":
			return <StatesPage />;

		case "vitals":
			return <VitalsPage />;


		case "not-found":
			return (
				<Message title="This page isn't here">
					There is nothing at this address.
				</Message>
			);
	}
}

function Clusters() {
	const polled = usePolled(fetchClusters);

	if (polled.status === "failed" || polled.status === "unknown") {
		return (
			<Message title="The clusters can't be read">
				The Observatory can't be reached.
			</Message>
		);
	}

	const clusters =
		polled.status === "ready" || polled.status === "stale" ? polled.data : [];

	return (
		<ClustersPage
			clusters={polled.status === "loading" ? undefined : clusters}
			notice={polled.status === "stale" ? staleNotice : undefined}
		/>
	);
}

function Cluster({ id }: { id: string }) {
	const watched = useWatched(id);

	switch (watched.status) {
		case "loading":
			return (
				<Page>
					<p className="text-muted">Loading…</p>
				</Page>
			);

		case "failed":
			return (
				<Message title="This cluster can't be read">
					The Observatory can't be reached.
				</Message>
			);

		case "unknown":
			return (
				<Message title="This cluster isn't known">
					The Observatory has no cluster with this ID. It may have been removed,
					or it may not have connected since the Observatory started. This page
					shows the cluster as soon as a node of it connects.
				</Message>
			);

		case "ready":
		case "stale":
			return (
				<LiveData receivedAt={watched.at}>
					<ClusterPage
						application={watched.data.application}
						data={watched.data.overview}
						down={watched.data.down}
						clusterId={id}
						notice={watched.status === "stale" ? staleNotice : undefined}
					/>
				</LiveData>
			);
	}
}
