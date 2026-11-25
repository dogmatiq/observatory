import { type ReactNode, useCallback, useEffect } from "react";
import { ClusterPage } from "./components/ClusterPage.tsx";
import { ClustersPage } from "./components/ClustersPage.tsx";
import { LinksPage } from "./components/LinksPage.tsx";
import { Message } from "./components/Message.tsx";
import { Page } from "./components/Page.tsx";
import { ReviewPage } from "./components/ReviewPage.tsx";
import { VitalsPage } from "./components/VitalsPage.tsx";
import { application, overview } from "./fixtures/overview.ts";
import {
	fetchClusters,
	fetchClustersOf,
	fetchInstallations,
} from "./lib/api.ts";
import { shortId } from "./lib/format.ts";
import { LiveData } from "./lib/live.tsx";
import { type Polled, usePolled } from "./lib/poll.ts";
import {
	applicationAtSitePath,
	applicationPath,
	clusterPath,
	routeOf,
	sitePath,
} from "./lib/route.ts";
import { useWatched } from "./lib/watch.ts";
import type { Installation, Site } from "./model.ts";

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

		case "site":
			return <SiteByKey siteKey={route.siteKey} />;

		case "application-at-site":
			return (
				<ApplicationAtSite
					siteKey={route.siteKey}
					applicationKey={route.applicationKey}
				/>
			);

		case "application":
			return <ApplicationByKey applicationKey={route.applicationKey} />;

		case "cluster":
			return <Cluster id={route.id} />;

		case "named":
			return <Named name={route.name} />;

		case "named-application-at-site":
			return (
				<NamedApplicationAtSite
					siteName={route.siteName}
					applicationName={route.applicationName}
				/>
			);

		case "moved":
			return <Moved to={route.to} />;

		case "fixture":
			// What the prototype's overview showed. It is static, and it is how the
			// cluster view is compared with the prototype.
			return <ClusterPage application={application} data={overview} />;


		case "review":
			return <ReviewPage />;

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

function Loading() {
	return (
		<Page>
			<p className="text-muted">Loading…</p>
		</Page>
	);
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

/**
 * Moved is an address that has moved. It shows the page at the new address, and
 * puts the new address in place of the old one in the browser.
 */
function Moved({ to }: { to: string }) {
	useEffect(() => {
		window.history.replaceState(null, "", to);
	}, [to]);

	return <App path={to} />;
}

/**
 * Found shows what the Observatory found for an address, which the page asks it
 * for again and again. While it has found nothing, the page says so with
 * `missing`, and shows what it finds as soon as it finds it.
 */
function Found<T>({
	polled,
	missing,
	children,
}: {
	polled: Polled<T[]>;
	missing: { title: string; text: string };
	children: (found: T[], notice: string | undefined) => ReactNode;
}) {
	switch (polled.status) {
		case "loading":
			return <Loading />;

		case "failed":
		case "unknown":
			return (
				<Message title="This page can't be read">
					The Observatory can't be reached.
				</Message>
			);

		case "ready":
		case "stale":
			if (polled.data.length === 0) {
				return <Message title={missing.title}>{missing.text}</Message>;
			}
			return children(
				polled.data,
				polled.status === "stale" ? staleNotice : undefined,
			);
	}
}

/** SiteByKey is the page of the site with the given key. */
function SiteByKey({ siteKey }: { siteKey: string }) {
	const read = useCallback(
		(signal: AbortSignal) => fetchInstallations({ siteKey }, signal),
		[siteKey],
	);

	return (
		<Found
			polled={usePolled(read)}
			missing={{
				title: "This site isn't known",
				text: "The Observatory knows no application at a site with this key. This page shows the site as soon as a node at it connects.",
			}}
		>
			{(installations, notice) => (
				<SiteApplications installations={installations} notice={notice} />
			)}
		</Found>
	);
}

/**
 * SiteApplications is the page of a site, which lists the applications at it.
 * The installations are those at the site.
 */
function SiteApplications({
	installations,
	notice,
}: {
	installations: Installation[];
	notice?: string;
}) {
	const site = installations[0]?.site;

	return (
		<LinksPage
			title={
				site === undefined
					? "Applications at no site"
					: `Applications at ${site.name}`
			}
			links={installations.map((i) => ({
				href: applicationAtSitePath(i.site?.key, i.application.key),
				label: i.application.name,
			}))}
			notice={notice}
		/>
	);
}

/** ApplicationByKey is the page of the application with the given key. */
function ApplicationByKey({ applicationKey }: { applicationKey: string }) {
	const read = useCallback(
		(signal: AbortSignal) => fetchInstallations({ applicationKey }, signal),
		[applicationKey],
	);

	return (
		<Found
			polled={usePolled(read)}
			missing={{
				title: "This application isn't known",
				text: "The Observatory knows no application with this key. This page shows the application as soon as a node of it connects.",
			}}
		>
			{(installations, notice) => (
				<ApplicationSites installations={installations} notice={notice} />
			)}
		</Found>
	);
}

/**
 * ApplicationSites is the page of an application at every site that it runs
 * at. The installations are those of the application. If there is only one, it
 * is the application view of that installation, and otherwise it lists them.
 */
function ApplicationSites({
	installations,
	notice,
}: {
	installations: Installation[];
	notice?: string;
}) {
	const [only, ...others] = installations;
	if (only !== undefined && others.length === 0) {
		return (
			<ApplicationAtSite
				siteKey={only.site?.key}
				applicationKey={only.application.key}
			/>
		);
	}

	return (
		<LinksPage
			title={`Sites that run ${installations[0]?.application.name}`}
			links={installations.map((i) => ({
				href: applicationAtSitePath(i.site?.key, i.application.key),
				label: i.site?.name ?? "No site",
			}))}
			notice={notice}
		/>
	);
}

/**
 * ApplicationAtSite is the application view of the application with the given
 * key at the site with the given key, or at no site if the site's key is
 * undefined.
 *
 * It shows the cluster that runs the application at the site. The page asks the
 * Observatory which one that is again and again, so that it moves on to the new
 * cluster when an engine restarts with a new ID. If several clusters run it at
 * once, the page lists them.
 */
function ApplicationAtSite({
	siteKey,
	applicationKey,
}: {
	siteKey: string | undefined;
	applicationKey: string;
}) {
	const read = useCallback(
		(signal: AbortSignal) => fetchClustersOf(siteKey, applicationKey, signal),
		[siteKey, applicationKey],
	);

	return (
		<Found
			polled={usePolled(read)}
			missing={{
				title: "This application isn't known at this site",
				text: "The Observatory knows no cluster that runs this application at this site. This page shows the application as soon as a node of it connects.",
			}}
		>
			{(clusters, notice) => {
				const [only, ...others] = clusters;
				if (only !== undefined && others.length === 0) {
					return <Cluster id={only.id} />;
				}

				return (
					<LinksPage
						title={`Clusters that run ${atSite(only?.application.name, only?.site)}`}
						intro="More than one cluster runs this application at this site."
						links={clusters.map((c) => ({
							href: clusterPath(c.id),
							label: c.id,
							detail: c.reporting ? undefined : "no signal",
						}))}
						notice={notice}
					/>
				);
			}}
		</Found>
	);
}

/**
 * atSite returns the name of an application, and the site that it runs at, as
 * words.
 */
function atSite(application: string | undefined, site: Site | undefined) {
	return site === undefined
		? `${application} at no site`
		: `${application} at ${site.name}`;
}

/**
 * Candidate is one of the things that a name leads to: a site, with the
 * installations at it, or an application, with its installations.
 */
type Candidate =
	| { kind: "site"; site: Site; installations: Installation[] }
	| {
			kind: "application";
			application: Installation["application"];
			installations: Installation[];
	  };

/**
 * candidatesNamed returns the sites and the applications that have the given
 * name, from the Observatory.
 */
async function candidatesNamed(
	name: string,
	signal: AbortSignal,
): Promise<Candidate[]> {
	const [atSites, ofApplications] = await Promise.all([
		fetchInstallations({ siteName: name }, signal),
		fetchInstallations({ applicationName: name }, signal),
	]);

	const sites = new Map<string, Candidate & { kind: "site" }>();
	for (const i of atSites) {
		if (i.site === undefined) {
			continue;
		}
		const c = sites.get(i.site.key) ?? {
			kind: "site",
			site: i.site,
			installations: [],
		};
		c.installations.push(i);
		sites.set(i.site.key, c);
	}

	const applications = new Map<string, Candidate & { kind: "application" }>();
	for (const i of ofApplications) {
		const c = applications.get(i.application.key) ?? {
			kind: "application",
			application: i.application,
			installations: [],
		};
		c.installations.push(i);
		applications.set(i.application.key, c);
	}

	return [...sites.values(), ...applications.values()];
}

/**
 * Named is the page of the site or the application with the given name. If
 * several have the name, it lists them.
 */
function Named({ name }: { name: string }) {
	const read = useCallback(
		(signal: AbortSignal) => candidatesNamed(name, signal),
		[name],
	);

	return (
		<Found
			polled={usePolled(read)}
			missing={{
				title: "No site or application has this name",
				text: `The Observatory knows no site or application named “${name}”. This page shows it as soon as a node of it connects.`,
			}}
		>
			{(candidates, notice) => {
				const [only, ...others] = candidates;
				if (only !== undefined && others.length === 0) {
					return only.kind === "site" ? (
						<SiteApplications
							installations={only.installations}
							notice={notice}
						/>
					) : (
						<ApplicationSites
							installations={only.installations}
							notice={notice}
						/>
					);
				}

				return (
					<LinksPage
						title={`More than one site or application is named ${name}`}
						links={candidates.map((c) =>
							c.kind === "site"
								? {
										href: sitePath(c.site.key),
										label: c.site.name,
										detail: `site ${shortId(c.site.key)}`,
									}
								: {
										href: applicationPath(c.application.key),
										label: c.application.name,
										detail: `application ${shortId(c.application.key)}`,
									},
						)}
						notice={notice}
					/>
				);
			}}
		</Found>
	);
}

/**
 * NamedApplicationAtSite is the application view of the application with the
 * given name at the site with the given name. If several applications at sites
 * have the names, it lists them.
 */
function NamedApplicationAtSite({
	siteName,
	applicationName,
}: {
	siteName: string;
	applicationName: string;
}) {
	const read = useCallback(
		(signal: AbortSignal) =>
			fetchInstallations({ siteName, applicationName }, signal),
		[siteName, applicationName],
	);

	return (
		<Found
			polled={usePolled(read)}
			missing={{
				title: "No application at a site has these names",
				text: `The Observatory knows no application named “${applicationName}” at a site named “${siteName}”. This page shows the application as soon as a node of it connects.`,
			}}
		>
			{(installations, notice) => {
				const [only, ...others] = installations;
				if (only !== undefined && others.length === 0) {
					return (
						<ApplicationAtSite
							siteKey={only.site?.key}
							applicationKey={only.application.key}
						/>
					);
				}

				return (
					<LinksPage
						title={`More than one application is named ${applicationName} at a site named ${siteName}`}
						links={installations.map((i) => ({
							href: applicationAtSitePath(i.site?.key, i.application.key),
							label: atSite(i.application.name, i.site),
							detail: `application ${shortId(i.application.key)}, site ${shortId(i.site?.key ?? "")}`,
						}))}
						notice={notice}
					/>
				);
			}}
		</Found>
	);
}

function Cluster({ id }: { id: string }) {
	const watched = useWatched(id);

	switch (watched.status) {
		case "loading":
			return <Loading />;

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
