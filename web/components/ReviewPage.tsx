import {
	Children,
	cloneElement,
	createContext,
	isValidElement,
	type ReactElement,
	type ReactNode,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";
import { application, overview } from "../fixtures/overview.ts";
import {
	euWest,
	siteApplications,
	siteOf,
	withContact,
} from "../fixtures/site.ts";
import { cn } from "../lib/cn.ts";
import { Covered } from "../lib/distrust.tsx";
import { formatCompact, formatPercent } from "../lib/format.ts";
import { LiveData } from "../lib/live.tsx";
import type { Application, OverviewData, SiteData } from "../model.ts";
import { NodesCard, WorkloadsCard } from "./ClusterCards.tsx";
import { EngineCard } from "./EngineCard.tsx";
import { Icon } from "./Icon.tsx";
import { Identifier } from "./Identifier.tsx";
import { InfoCard } from "./InfoCard.tsx";
import {
	ClusterTile,
	clusterAbout,
	EngineTile,
	EventsTile,
	engineAbout,
	eventsAbout,
	QueuesTile,
	Totals,
} from "./Overview.tsx";
import { Page } from "./Page.tsx";
import { panelClasses } from "./Popover.tsx";
import { partialText } from "./partial.ts";
import { Ramped } from "./Ramped.tsx";
import { RateCard } from "./RateCard.tsx";
import { SegmentCard } from "./SegmentCard.tsx";
import {
	ApplicationsCard,
	ApplicationsTile,
	SiteBreakdown,
	SiteOverview,
	siteAbout,
	siteEventRateWords,
	siteHandlingWords,
	sitePartialStatus,
} from "./SiteView.tsx";

/**
 * ReviewPage shows every state of the tiles that are being worked on, or that
 * have something undecided, side by side, so that a person reviewing a tile sees
 * all of them and not only the one that the data happens to be in. Each tile is
 * shown whole, and then part by part, in the order of review, from the least
 * specific to the most: its icon, its headline, its detail line, its
 * bar and its chart. A card whose words never change, and that has a status in
 * some states, is shown once, with its status.
 *
 * A popover is drawn where it stands, in the frame of a panel, because a person
 * can't point at several at once.
 */
export function ReviewPage() {
	// The states are drawn again, from the start, when it changes, so that an
	// animation can be watched again.
	const [run, setRun] = useState(0);
	const accepted = useAccepted();

	return (
		<Accepted.Provider value={accepted}>
			<Page>
				<div className="mb-8 flex items-center justify-between gap-4">
					<p className="text-muted">
						Each tile under review, whole and then part by part, from its icon
						to its chart. Animations play when the page opens, and again when
						they are replayed.
					</p>
					<button
						type="button"
						className="flex-none cursor-pointer rounded-control border border-line bg-panel px-3 py-1.5 text-sm text-fg-soft hover:border-line-strong"
						onClick={() => setRun((n) => n + 1)}
					>
						Replay animations
					</button>
				</div>
				<div key={run} className="grid gap-16">
					<Tile
						code="EV"
						title="Events tile"
						note="Under review: the status on the card of the icon while only some nodes report what the tile shows, and the card of a segment of the bar, which drills down, with its figures apart from its words. The rest of the tile is settled, including the tile of an engine that appends every event to one stream."
					>
						<Part step={0} title="The tile">
							<State label="Several streams" decided>
								<EventsTile
									application={application}
									data={overview.events}
									href={undefined}
								/>
							</State>
							<State
								label="An engine that appends every event to one stream"
								note="The engine says so, so the one stream is the only one there is. The tile doesn't count streams, and has no bar, because there is no spread to show."
								decided
							>
								<EventsTile
									application={application}
									data={{
										...overview.events,
										streams: [{ id: "85d749b5", size: 1181 }],
										oneStream: true,
									}}
									href={undefined}
								/>
							</State>
							<State
								label="Only some of the nodes report what the tile shows"
								note="The coverage rule: the numbers are the sums of the nodes that report, blurred by the share of nodes that don't, and they glitch for a moment each time another node stops reporting. The bar and the chart stay live. Stop and start nodes to see it."
								recommendation="Approve. The reader keeps the numbers and their trend while a deploy is under way, and the blur says how far to trust them, by the same means as a figure that is going stale."
							>
								<CoverageDemo />
							</State>
						</Part>

						<Part
							step={1}
							title="The icon"
							decided={false}
							note="While only some of the cluster's nodes report what the tile shows, its numbers are the sums of the nodes that do, blurred by how few they are, and they glitch for a moment each time another node stops reporting. The card of the icon says why, as a status. The queues tile and the kind icon of a handler card show the same status in the same case."
						>
							<State
								label="A version is unknown"
								recommendation="Approve, with this wording. It says what the nodes do, then what follows for the numbers, as the user sees them, and then the likely cause."
							>
								<Panel>
									<EventsIconCard status={partialText(undefined)} />
								</Panel>
							</State>
							<State
								label={"The nodes run different versions of the engine"}
								note={
									"The nodes' preambles show the versions, so the status says what they show."
								}
								recommendation="Approve, with this wording."
							>
								<Panel>
									<EventsIconCard
										status={
											"Only some of the cluster's nodes report what this section shows, so its numbers include only those nodes. The cluster's nodes are running different versions of the engine."
										}
									/>
								</Panel>
							</State>
							<State
								label={"The nodes run different versions of the application"}
								note={
									"The nodes' preambles show the versions, so the status says what they show."
								}
								recommendation="Approve, with this wording."
							>
								<Panel>
									<EventsIconCard
										status={
											"Only some of the cluster's nodes report what this section shows, so its numbers include only those nodes. The cluster's nodes are running different versions of the application."
										}
									/>
								</Panel>
							</State>
							<State
								label={"The nodes run different versions of both"}
								note={
									"The nodes' preambles show the versions, so the status says what they show."
								}
								recommendation="Approve, with this wording."
							>
								<Panel>
									<EventsIconCard
										status={
											"Only some of the cluster's nodes report what this section shows, so its numbers include only those nodes. The cluster's nodes are running different versions of the engine and of the application."
										}
									/>
								</Panel>
							</State>
							<State
								label={"The versions are the same"}
								note={
									"Every node runs the same versions, so the status doesn't blame the version."
								}
								recommendation="Approve, with this wording."
							>
								<Panel>
									<EventsIconCard
										status={
											"Only some of the cluster's nodes report what this section shows, so its numbers include only those nodes."
										}
									/>
								</Panel>
							</State>
							<Choices
								of="A"
								title="the status"
								choices={[
									[
										"The consequence first",
										<EventsIconCard
											key="first"
											status="This section's numbers include only some of the cluster's nodes, because the other nodes don't report what this section shows. Some nodes may be running a different version of the engine."
										/>,
									],
									[
										"Saying when it ends",
										<EventsIconCard
											key="ends"
											status="Only some of the cluster's nodes report what this section shows, so its numbers are blurred until every node reports what this section shows. Some nodes may be running a different version of the engine."
										/>,
									],
								]}
							/>
						</Part>

						<Part
							step={4}
							title="The bar"
							decided={false}
							recommendation="Approve. The sentence about the bar is the same each time and has no figures in it, which are the stream's events and share."
							note="Each segment is an event stream, and has the card of that stream: its events and its share of them, then what the bar shows, and the advice about how it is best spread. An engine that appends every event to one stream has no bar, so the card is only ever of one of several streams."
						>
							{(
								[
									[
										"A stream with a share",
										7612,
										0.6234,
										{ amount: 12_210, things: 2 },
									],
								] as const
							).map(([label, amount, share, total]) => (
								<State key={label} label={`Pointing at ${label.toLowerCase()}`}>
									<Panel>
										<SegmentCard
											about={{
												thing: "event-stream",
												id: "8b0081fd-3f1c-4e8a-9d57-0b1c6a2e4f10",
												amount,
												share,
												total,
											}}
										/>
									</Panel>
								</State>
							))}
						</Part>
					</Tile>

					<Tile
						code="QU"
						title="Queues tile"
						note="Under review: the card of a segment of the bar, as on the events tile. The rest of the tile is settled, including the tile of an engine that keeps every message in one queue."
					>
						<Part step={0} title="The tile">
							<State label="Several queues" decided>
								<QueuesTile
									application={application}
									data={{
										...overview.queues,
										queues: [
											{ id: "113cbdc3", size: 12 },
											{ id: "4aeaa462", size: 7 },
										],
									}}
									href={undefined}
								/>
							</State>
							<State
								label="An engine that keeps every message in one queue"
								note="The engine says so, so the one queue is the only one there is. The tile doesn't count queues, and has no bar, because there is no spread to show."
								decided
							>
								<QueuesTile
									application={application}
									data={{ ...overview.queues, oneQueue: true }}
									href={undefined}
								/>
							</State>
						</Part>
						<Part
							step={4}
							title="The bar"
							decided={false}
							recommendation="Approve, as the events tile's bar."
							note="Each segment is a queue, and has the card of that queue: its messages and its share of them, then what the bar shows, and the advice about how it is best spread. An engine that keeps every message in one queue has no bar, so the card is only ever of one of several queues."
						>
							{(
								[
									["A queue with a share", 12, 0.6, { amount: 20, things: 3 }],
								] as const
							).map(([label, amount, share, total]) => (
								<State key={label} label={`Pointing at ${label.toLowerCase()}`}>
									<Panel>
										<SegmentCard
											about={{
												thing: "queue",
												id: "113cbdc3-5b2d-4e8a-a1c6-0d4b8e2f7a93",
												amount,
												share,
												total,
											}}
										/>
									</Panel>
								</State>
							))}
						</Part>
					</Tile>

					<Tile
						code="CL"
						title="Cluster tile"
						note="The tile of an engine that clusters, in each of its states, and then its parts, from the least specific to the most: what its icon, its headline, its detail line and its bar show when they are pointed at, and its chart."
					>
						<Part step={0} title="The tile">
							{(
								[
									["Several nodes", undefined, 3],
									["One node", "The words are singular.", 1],
									[
										"No live nodes",
										"The cluster is offline. The number is red, and so is the accent along the top. The words still make a sentence with the number.",
										0,
									],
								] as const
							).map(([label, note, nodes]) => (
								<State key={label} label={label} note={note} decided>
									<ClusterTile
										application={application}
										data={clusterTile(nodes)}
										href={undefined}
									/>
								</State>
							))}
							<State
								label="An engine that doesn't divide its work"
								note="The tile leaves the workloads out, and has no bar, because a bar of nodes alone would only say how many there are, which the headline says."
								decided
							>
								<ClusterTile
									application={application}
									data={{
										nodes: overview.cluster.nodes.map(
											({ workloads: _, ...n }) => n,
										),
									}}
									href={undefined}
								/>
							</State>
							<State
								label="A node that doesn't report its workloads"
								note="Other nodes report their workloads and this one doesn't, so this one is supported and not working, and the page says only that it may be running a different version of the engine: its share isn't known, and its segment is a faint square. The number of workloads counts only the nodes that report them, blurred by how few they are."
								decided={false}
								recommendation="Approve. The cluster supports what any of its nodes supports, and a node that doesn't is supported and not working, which it stops being when every node supports the same things."
							>
								<ClusterTile
									application={application}
									data={{
										...overview.cluster,
										nodes: overview.cluster.nodes.map((n, i) =>
											i === 1 ? { id: n.id, heartbeats: n.heartbeats } : n,
										),
									}}
									href={undefined}
								/>
							</State>
						</Part>

						<Part
							step={1}
							title="The icon"
							decided={true}
							note="The same in every state: what the tile is about, and which cluster this is."
						>
							<State label="Pointing at the icon">
								<Panel>
									<InfoCard
										subsystem="cluster"
										icon="cluster"
										kind="Cluster"
										identifier={
											<Identifier
												id="3f6c1a52-9d1b-4c52-8f0a-2a7d6b1e9c04"
												of="cluster"
											/>
										}
									>
										{clusterAbout(application)}
									</InfoCard>
								</Panel>
							</State>
						</Part>

						<Part
							step={2}
							title="The headline"
							decided={false}
							recommendation="Approve. The card counts nodes, so it has the node's icon, as the card of each node on the bar does, and its words never change."
							note="Its words never change. Its icon is the node's, because the number counts nodes. The status at the bottom shows only while no node is live, so the card is shown with it."
						>
							<State
								label="Pointing at the number of nodes"
								recommendation="Approve, with this wording. It starts by saying what the number is, as the cards of the rates and of the messages waiting do, and says that it counts the nodes in contact, so that a count during an outage of one node isn't read as the size of the cluster. The words for contact are reviewed on their own, at WD."
							>
								<Panel>
									<NodesCard live={0} />
								</Panel>
							</State>
							<Choices
								of="A"
								title="what the card says about the count"
								choices={[
									[
										"As it was",
										<InfoCard
											key="As it was"
											subsystem="cluster"
											icon="node"
											kind="Cluster nodes"
											status={{
												icon: "alert",
												text: "Contact with every node has been lost, so it's unknown whether the application is working.",
											}}
										>
											<p key="0">
												A node is one running process of the application's
												engine. Together, the nodes form a cluster that shares
												the application's work.
											</p>
										</InfoCard>,
									],
									[
										"In the same paragraph",
										<InfoCard
											key="In the same paragraph"
											subsystem="cluster"
											icon="node"
											kind="Cluster nodes"
											status={{
												icon: "alert",
												text: "Contact with every node has been lost, so it's unknown whether the application is working.",
											}}
										>
											<p key="0">
												A node is one running process of the application's
												engine. Together, the nodes form a cluster that shares
												the application's work. The number counts the nodes that
												are in contact now.
											</p>
										</InfoCard>,
									],
									[
										"As a paragraph of its own",
										<InfoCard
											key="As a paragraph of its own"
											subsystem="cluster"
											icon="node"
											kind="Cluster nodes"
											status={{
												icon: "alert",
												text: "Contact with every node has been lost, so it's unknown whether the application is working.",
											}}
										>
											<p key="0">
												A node is one running process of the application's
												engine. Together, the nodes form a cluster that shares
												the application's work.
											</p>
											<p key="1">
												The number counts the nodes that are in contact now.
											</p>
										</InfoCard>,
									],
									[
										"As a node that is not counted",
										<InfoCard
											key="As a node that is not counted"
											subsystem="cluster"
											icon="node"
											kind="Cluster nodes"
											status={{
												icon: "alert",
												text: "Contact with every node has been lost, so it's unknown whether the application is working.",
											}}
										>
											<p key="0">
												A node is one running process of the application's
												engine. Together, the nodes form a cluster that shares
												the application's work.
											</p>
											<p key="1">
												A node that has lost contact is not counted.
											</p>
										</InfoCard>,
									],
								]}
							/>
						</Part>

						<Part
							step={3}
							title="The detail line"
							decided={false}
							recommendation="Approve. Its words never change. While only some of the nodes report their workloads, the number counts the workloads of the nodes that do, blurred by how few they are, and the card says so, as a status, which is shown here."
							note="The line under the headline, such as “cluster nodes, 5 workloads”. The words “cluster nodes” have the card of the headline, above. The workloads have their own, which never changes, and are left out for an engine that doesn't divide its work."
						>
							<State
								label="Pointing at “5 workloads”"
								recommendation="Approve, with this wording. A task that goes on is something anyone can picture, and it says that a node owns each workload, which the bar shows."
							>
								<Panel>
									<WorkloadsCard whole={false} />
								</Panel>
							</State>
							<Choices
								of="A"
								title="what a workload is"
								choices={(
									[
										[
											"As it was",
											"A workload is one unit of the work that the cluster's nodes share, such as delivering messages to one of the application's handlers.",
										],
										[
											"Carried out continually",
											"A workload is a task that a node carries out continually for the cluster, such as delivering messages to one of the application's handlers.",
										],
										[
											"With sizes",
											"A workload is an ongoing task that the cluster gives to one of its nodes, such as delivering messages to one of the application's handlers. Some workloads take much more work than others.",
										],
									] as const
								).map(([label, text]) => [
									label,
									<InfoCard
										key={label}
										subsystem="cluster"
										icon="workload"
										kind="Workloads"
										status={{
											icon: "alert",
											text: "Only some of the cluster's nodes report their workloads, so the total counts only the workloads of those nodes.",
										}}
									>
										<p>{text}</p>
									</InfoCard>,
								])}
							/>
						</Part>

						<Part
							step={4}
							title="The bar"
							decided={false}
							recommendation="Approve. A node's card drills down: its workloads and its share are its figures, a node that owns none has no share, and a node that doesn't report its workloads, while others do, shows only its ID, with a status. The words about the bar never change."
							note="Each segment is a node, and has the card of that node. The card drills down: its figures are the node's workloads and its share of them, and its words, about the bar, never change. A node that owns none has no share."
						>
							{(
								[
									[
										"A node that owns some",
										3,
										0.6,
										"Approve, with these words about the bar, which 4B shows too. The first paragraph is the one the other bars have. The second is apart, where the other bars have their advice, and says briefly why a count of workloads is not how busy a node is. Nothing in the spec says how big a workload is.",
									],
									["A node that owns none", 0, 0, undefined],
								] as const
							).map(([label, amount, share, recommendation]) => (
								<State
									key={label}
									label={`Pointing at ${label.toLowerCase()}`}
									decided={recommendation === undefined ? undefined : false}
									recommendation={recommendation}
								>
									<Panel>
										<SegmentCard
											about={{
												thing: "node",
												id: nodeId,
												amount,
												share,
												total: { amount: 5, things: 3 },
											}}
										/>
									</Panel>
								</State>
							))}
							<State
								label="Pointing at a node that doesn't report its workloads"
								note="Other nodes report their workloads and this one doesn't, so its card has a status. One or several nodes can be in this state at once."
								decided={false}
								recommendation="Approve, with this wording. It is supported and not working, so it keeps its place in the bar, as a faint square, and its card says why, as a status, without a negation."
							>
								<Panel>
									<SegmentCard
										about={{ thing: "node", id: nodeId, unreported: true }}
									/>
								</Panel>
							</State>
							<Choices
								of="A"
								title="the words about the bar, on 4A and 4B"
								choices={[
									[
										"One node busier than another",
										<NodeCardWith
											key="busier-than"
											paragraphs={[
												"This bar shows how the cluster's workloads are spread across its nodes.",
												"Workloads vary in size, so one node can be busier than another node with the same number of workloads.",
											]}
										/>,
									],
									[
										"Two nodes, as busy as each other or not",
										<NodeCardWith
											key="two-busy"
											paragraphs={[
												"This bar shows how the cluster's workloads are spread across its nodes.",
												"Workloads vary in size, so two nodes with the same number of workloads can be very different in how busy they are.",
											]}
										/>,
									],
									[
										"Counts and work",
										<NodeCardWith
											key="0"
											paragraphs={[
												"This bar shows how the cluster's workloads are spread across its nodes.",
												"Some workloads take more work than others, so equal counts can mean unequal work.",
											]}
										/>,
									],
									[
										"Not always busier",
										<NodeCardWith
											key="1"
											paragraphs={[
												"This bar shows how the cluster's workloads are spread across its nodes.",
												"Workloads vary in size, so a node with more workloads isn't always busier.",
											]}
										/>,
									],
									[
										"Naming the resources",
										<NodeCardWith
											key="2"
											paragraphs={[
												"This bar shows how the cluster's workloads are spread across its nodes.",
												"Workloads vary in size, so nodes with the same number of workloads can use very different amounts of CPU and memory.",
											]}
										/>,
									],
									[
										"One paragraph, as before",
										<NodeCardWith
											key="3"
											paragraphs={[
												"This bar shows how the cluster's workloads are spread across its nodes. Some workloads have much more to do than others, so one node can be much busier than another with the same number of workloads.",
											]}
										/>,
									],
								]}
							/>
							<Choices
								of="C"
								title="the status"
								choices={[
									[
										"The consequence first",
										<NodeCardWith
											key="first"
											status="This node's workloads are unknown. Other nodes in the cluster report their workloads, so this node may be running a different version of the engine."
										/>,
									],
									[
										"As a contrast",
										<NodeCardWith
											key="contrast"
											status="Some of the cluster's nodes report their workloads and this node doesn't report its workloads, so this node may be running a different version of the engine."
										/>,
									],
								]}
							/>
						</Part>

						<Part
							step={5}
							title="The chart"
							decided={true}
							note="The heartbeat of each live node. With none live, the grey line breaks into static now and then, and a lens scans along it. When the first node comes back the lens finds it, after static and a short search if it wasn't scanning, and the heartbeat grows out of that place as a ripple. When the last node goes, the heartbeat settles back to the flat line. Add and remove nodes to see each."
						>
							<State label="Nodes coming and going">
								<Nodes application={application} />
							</State>
						</Part>
					</Tile>

					<Tile
						code="EN"
						title="Engine tile"
						note="The tile of an engine that doesn't cluster, in place of the cluster tile, in each of its states, and then its parts, from the least specific to the most. It has no detail line and no bar."
					>
						<Part step={0} title="The tile">
							<State label="Online" decided>
								<EngineTile
									application={application}
									data={{ node: overview.cluster.nodes[0] }}
									href={undefined}
								/>
							</State>
							<State
								label="Offline"
								note="The headline is red, and so is the accent along the top."
								decided
							>
								<EngineTile
									application={application}
									data={{}}
									href={undefined}
								/>
							</State>
							<State
								label="In the row of tiles"
								note="In place of the cluster tile, beside the events and queues tiles."
								wide
								decided
							>
								<div style={{ width: 960 }}>
									<Totals
										application={application}
										data={{
											...overview,
											cluster: undefined,
											engine: { node: overview.cluster.nodes[0] },
										}}
									/>
								</div>
							</State>
						</Part>

						<Part
							step={1}
							title="The icon"
							decided
							note="The same in every state: what the tile is about, and the engine's ID."
						>
							<State label="Pointing at the icon">
								<Panel>
									<InfoCard
										subsystem="cluster"
										icon="engine"
										kind="Engine"
										identifier={
											<Identifier
												id="113cbdc3-5b2d-4e8a-a1c6-0d4b8e2f7a93"
												of="engine"
											/>
										}
									>
										{engineAbout(application)}
									</InfoCard>
								</Panel>
							</State>
						</Part>

						<Part
							step={2}
							title="The headline"
							decided={false}
							recommendation="Approve. The card says what being online means for the reader, and the status says what is unknown once contact is lost. Neither mentions nodes or clusters."
							note="Its words never change. The status at the bottom shows only while the engine is offline, so the card is shown with it."
						>
							<State
								label="Pointing at “Online” or “Offline”"
								recommendation="Approve, with this wording. It says what online is and what follows for the reader: the figures can be trusted. The status says what is unknown when contact is lost. The words for contact are reviewed on their own, at WD."
							>
								<Panel>
									<EngineCard online={false} />
								</Panel>
							</State>
							<Choices
								of="A"
								title="what online means"
								choices={[
									[
										"Online defined as in contact",
										<InfoCard
											key="Online defined as in contact"
											subsystem="cluster"
											icon="engine"
											kind="Engine"
											status={{
												icon: "alert",
												text: "Contact with the engine has been lost, so it's unknown whether the application is working.",
											}}
										>
											<p>The engine is online while it is in contact.</p>
										</InfoCard>,
									],
									[
										"Defined, then what follows",
										<InfoCard
											key="Defined, then what follows"
											subsystem="cluster"
											icon="engine"
											kind="Engine"
											status={{
												icon: "alert",
												text: "Contact with the engine has been lost, so it's unknown whether the application is working.",
											}}
										>
											<p>
												Online means that the engine is in contact, so the
												figures on this page are current.
											</p>
										</InfoCard>,
									],
									[
										"What the reader can rely on",
										<InfoCard
											key="What the reader can rely on"
											subsystem="cluster"
											icon="engine"
											kind="Engine"
											status={{
												icon: "alert",
												text: "Contact with the engine has been lost, so it's unknown whether the application is working.",
											}}
										>
											<p>
												While the engine is online, this page shows what the
												engine is doing now.
											</p>
										</InfoCard>,
									],
								]}
							/>
						</Part>

						<Part
							step={3}
							title="The chart"
							decided={true}
							note="The heartbeat of the engine, which behaves as the cluster tile's does for one node."
						/>
					</Tile>

					<Tile
						code="WD"
						title="Words for contact"
						note="Each place where a card says what is in contact with the nodes, or with the engine, reviewed on its own until there is a consensus. The user is using an app, so a card doesn't say &quot;this page&quot;. Each state shows the card with that one place changed, and its other words as recommended."
					>
						<Part
							step={1}
							title="The cluster nodes card: what the number counts"
							note="The first sentence of the card on the cluster tile's headline."
						>
							<State
								label="In contact, with no one named"
								wide
								recommendation={
									'Approve, with this wording. "In contact" needs no one named, as in "stay in contact", so the sentence holds without naming the app.'
								}
							>
								<ContactCard
									card="nodes-paragraph"
									text="The number of nodes that are in contact now. A node is one running process of the application's engine. Together, the nodes form a cluster that shares the application's work."
								/>
							</State>
							<Choices
								of="A"
								title="the words"
								framed={false}
								choices={[
									[
										"Visible",
										<ContactCard
											key="Visible"
											card="nodes-paragraph"
											text="The number of nodes that are visible now. A node is one running process of the application's engine. Together, the nodes form a cluster that shares the application's work."
										/>,
									],
									[
										"Reporting",
										<ContactCard
											key="Reporting"
											card="nodes-paragraph"
											text="The number of nodes that are reporting now. A node is one running process of the application's engine. Together, the nodes form a cluster that shares the application's work."
										/>,
									],
									[
										"Connected",
										<ContactCard
											key="Connected"
											card="nodes-paragraph"
											text="The number of nodes that are connected now. A node is one running process of the application's engine. Together, the nodes form a cluster that shares the application's work."
										/>,
									],
									[
										"Naming the Observatory",
										<ContactCard
											key="Naming the Observatory"
											card="nodes-paragraph"
											text="The number of nodes in contact with the Observatory now. A node is one running process of the application's engine. Together, the nodes form a cluster that shares the application's work."
										/>,
									],
								]}
							/>
						</Part>
						<Part
							step={2}
							title="The cluster nodes card: the status when no node is in contact"
							note="The status of the same card while no node is in contact."
						>
							<State
								label="Out of contact"
								wide
								recommendation={
									'Approve, with this wording. "Out of contact" says what is known, names no one, and is about the nodes, which are what the card counts.'
								}
							>
								<ContactCard
									card="nodes-status"
									text="Every node is out of contact, so it's unknown whether the application is working."
								/>
							</State>
							<Choices
								of="A"
								title="the words"
								framed={false}
								choices={[
									[
										"Contact lost",
										<ContactCard
											key="Contact lost"
											card="nodes-status"
											text="Contact with every node has been lost, so it's unknown whether the application is working."
										/>,
									],
									[
										"Out of sight",
										<ContactCard
											key="Out of sight"
											card="nodes-status"
											text="Every node is out of sight, so it's unknown whether the application is working."
										/>,
									],
									[
										"Naming the Observatory",
										<ContactCard
											key="Naming the Observatory"
											card="nodes-status"
											text="The Observatory has lost contact with every node, so it's unknown whether the application is working."
										/>,
									],
								]}
							/>
						</Part>
						<Part
							step={3}
							title="The engine card: what online means"
							note="The first half of the card on the engine tile's headline."
						>
							<State
								label="In contact, with no one named"
								wide
								recommendation="Approve, with this wording. It defines online by contact, as the cluster's card counts nodes by it, without naming the app."
							>
								<ContactCard
									card="engine-online"
									text="The engine is online while it is in contact, so the figures shown are current."
								/>
							</State>
							<Choices
								of="A"
								title="the words"
								framed={false}
								choices={[
									[
										"Visible",
										<ContactCard
											key="Visible"
											card="engine-online"
											text="The engine is online while it is visible, so the figures shown are current."
										/>,
									],
									[
										"Reporting",
										<ContactCard
											key="Reporting"
											card="engine-online"
											text="The engine is online while it is reporting, so the figures shown are current."
										/>,
									],
									[
										"Naming the Observatory",
										<ContactCard
											key="Naming the Observatory"
											card="engine-online"
											text="The engine is online while it is in contact with the Observatory, so the figures shown are current."
										/>,
									],
								]}
							/>
						</Part>
						<Part
							step={4}
							title="The engine card: which figures are current"
							note={
								'The second half of the same sentence, which said "the figures on this page".'
							}
						>
							<State
								label="The figures shown"
								wide
								recommendation={
									'Approve, with this wording. "Shown" points at what the user sees without naming a page or a screen.'
								}
							>
								<ContactCard
									card="engine-figures"
									text="The engine is online while it is in contact, so the figures shown are current."
								/>
							</State>
							<Choices
								of="A"
								title="the words"
								framed={false}
								choices={[
									[
										"These figures",
										<ContactCard
											key="These figures"
											card="engine-figures"
											text="The engine is online while it is in contact, so these figures are current."
										/>,
									],
									[
										"The figures here",
										<ContactCard
											key="The figures here"
											card="engine-figures"
											text="The engine is online while it is in contact, so the figures here are current."
										/>,
									],
									[
										"The engine's figures",
										<ContactCard
											key="The engine's figures"
											card="engine-figures"
											text="The engine is online while it is in contact, so the engine's figures are current."
										/>,
									],
								]}
							/>
						</Part>
						<Part
							step={5}
							title="The engine card: the status when the engine is out of contact"
							note="The status of the same card while the engine is offline."
						>
							<State
								label="Out of contact"
								wide
								recommendation="Approve, with this wording. It matches the cluster's status, and says what is known without naming anyone."
							>
								<ContactCard
									card="engine-status"
									text="The engine is out of contact, so it's unknown whether the application is working."
								/>
							</State>
							<Choices
								of="A"
								title="the words"
								framed={false}
								choices={[
									[
										"Contact lost",
										<ContactCard
											key="Contact lost"
											card="engine-status"
											text="Contact with the engine has been lost, so it's unknown whether the application is working."
										/>,
									],
									[
										"Naming the Observatory",
										<ContactCard
											key="Naming the Observatory"
											card="engine-status"
											text="The Observatory has lost contact with the engine, so it's unknown whether the application is working."
										/>,
									],
								]}
							/>
						</Part>
					</Tile>

					<Tile
						code="SV"
						title="Site view"
						note="The view of a site, designed here before it is built: the totals of the applications at the site as three tiles, the same size as the cluster view's, and each application below them. It is shown at the scale that it is designed for, which is about a hundred applications. The figures are made up."
					>
						<Part
							step={0}
							title="The view"
							recommendation="Approve the layout. The tiles answer how busy the site is and whether anything is wrong, and the grid below answers where, with every application one click from its view."
							note="The applications are in the order of their names, so that an application keeps its place. The tiles follow the cluster view's rules: the coverage rule blurs the totals while only some nodes report them, and the totals of a site whose applications are all out of contact are the last ones, distrusted."
						>
							<State
								label="Every application in contact, three with failing messages"
								wide
							>
								<SiteDemo data={siteOf(siteApplications, euWest)} />
							</State>
							<State
								label="Two applications out of contact, and two with only some nodes in contact"
								note="The two out of contact have the red accent, and say so. The figures of the two partly in contact are blurred by the coverage rule, and so, slightly, are the totals."
								wide
							>
								<SiteDemo data={siteOf(someOut, euWest)} />
							</State>
							<State label="Every application out of contact" wide>
								<SiteDemo
									data={siteOf(
										withContact(siteApplications.slice(0, 18), {
											out: siteApplications
												.slice(0, 18)
												.map((a) => a.application.name),
										}),
										euWest,
									)}
								/>
							</State>
							<State label="One application" wide>
								<SiteDemo
									data={siteOf(siteApplications.slice(81, 82), euWest)}
								/>
							</State>
							<State
								label="Applications at no site"
								note="The view of the applications that run at no site, at the address of the site whose key is the nil UUID. Its words say &quot;the applications that run at no site&quot;."
								wide
							>
								<SiteDemo
									data={siteOf(siteApplications.slice(40, 52), undefined)}
								/>
							</State>
						</Part>

						<Part
							step={1}
							title="The grid of applications"
							note="Each application is a small card with its name, its events per minute and its messages waiting, which links to its application view. The alternative is the plan's first idea, a grid of squares like a contribution graph, which names an application only when it is pointed at."
						>
							<State
								label="Cards with names and figures"
								recommendation="Approve. A reader finds an application by its name at a glance, and sees its figures without pointing at it. A hundred cards fit in about a screen."
								wide
							>
								<SiteBreakdown
									data={siteOf(someOut, euWest)}
									breakdown="cells"
								/>
							</State>
							<Choices
								of="A"
								title="the grid"
								framed={false}
								choices={[
									[
										"Squares, like a contribution graph",
										<SiteBreakdown
											key="squares"
											data={siteOf(someOut, euWest)}
											breakdown="squares"
										/>,
									],
								]}
							/>
						</Part>

						<Part
							step={2}
							title="The icons"
							note="The card of each tile's icon says what its section is about. Nothing on the view says what a site is yet. While only some of the applications' nodes report what the events or queues tile shows, its card says why, as a status. It says nothing about versions, because the applications at a site run different engines and versions as a matter of course."
						>
							<State
								label="The events tile, while only some nodes report it"
								recommendation="Approve, with this wording."
							>
								<Panel>
									<InfoCard
										subsystem="streams"
										icon="event"
										kind="Events"
										status={sitePartialStatus}
									>
										{siteAbout.events(euWest)}
									</InfoCard>
								</Panel>
							</State>
							<State
								label="The queues tile, while only some nodes report it"
								recommendation="Approve, with this wording."
							>
								<Panel>
									<InfoCard
										subsystem="queues"
										icon="message"
										kind="Queues"
										status={sitePartialStatus}
									>
										{siteAbout.queues(euWest)}
									</InfoCard>
								</Panel>
							</State>
							<State
								label="The applications tile"
								recommendation="Approve, with this wording."
							>
								<Panel>
									<InfoCard
										subsystem="cluster"
										icon="application"
										kind="Applications"
									>
										{siteAbout.applications(euWest)}
									</InfoCard>
								</Panel>
							</State>
							<State
								label="At no site"
								note="The same cards, for the applications that run at no site."
								recommendation="Approve, with this wording."
							>
								<Panel>
									<InfoCard
										subsystem="cluster"
										icon="application"
										kind="Applications"
									>
										{siteAbout.applications(undefined)}
									</InfoCard>
								</Panel>
							</State>
						</Part>

						<Part
							step={3}
							title="The headlines and detail lines"
							note="The events tile's headline is the events per minute, and its detail line counts the applications that recorded any. The queues tile's is the messages waiting, with those that are failing, as on the cluster view, and its detail line gives the messages handled per minute. The applications tile's is the number of applications in contact, and its detail line gives the number out of contact, if any are."
						>
							<State
								label="The card of the applications in contact"
								note="Its status is there only while every application is out of contact."
								recommendation="Approve, with this wording. It covers an engine that clusters and one that doesn't, so it says &quot;its engine, or any node of its cluster&quot;. The status follows the cluster's &quot;Every node is out of contact, so it's unknown whether the application is working&quot;."
							>
								<Panel>
									<ApplicationsCard live={0} />
								</Panel>
							</State>
							<State
								label="The card of the events per minute"
								recommendation="Approve, with this wording, which is the cluster's with &quot;the applications&quot; in place of &quot;the application&quot;."
							>
								<Panel>
									<RateCard
										subsystem="streams"
										icon="event"
										words={siteEventRateWords}
										state="known"
									/>
								</Panel>
							</State>
							<State
								label="The card of the messages handled per minute"
								recommendation="Approve, with this wording, as for the events."
							>
								<Panel>
									<RateCard
										subsystem="queues"
										icon="message"
										words={siteHandlingWords}
										state="known"
									/>
								</Panel>
							</State>
						</Part>

						<Part
							step={4}
							title="The bars"
							note="The bars of the events and queues tiles have a segment for each of the busiest applications, largest first, and one for the rest, as a cluster's bars do for streams and queues. A segment's card drills down: the application's name, its amount and its share. It gives no advice, because nothing is promised about how the applications at a site are best spread. The applications tile has no bar."
						>
							<State
								label="Pointing at an application on the events bar"
								recommendation="Approve, with this wording."
							>
								<Panel>
									<SegmentCard
										about={{
											thing: "application",
											of: "events",
											application: { name: "payments", key: "p" },
											amount: 2140,
											share: 0.1834,
										}}
									/>
								</Panel>
							</State>
							<State
								label="Pointing at an application on the queues bar"
								recommendation="Approve, with this wording."
							>
								<Panel>
									<SegmentCard
										about={{
											thing: "application",
											of: "messages",
											application: { name: "payments", key: "p" },
											amount: 31,
											share: 0.124,
										}}
									/>
								</Panel>
							</State>
						</Part>

						<Part
							step={5}
							title="The applications tile's chart"
							recommendation="Approve. The heartbeat chart of the cluster tile, with an equal share of its width for each application in contact, so that the site has a pulse."
							note="Each application's share follows the heartbeats of its node that sent the latest one. An application out of contact has no share, so its share shrinks away when contact is lost."
						>
							<State label="Every application in contact" wide>
								<div className="max-w-md">
									<SiteDemo
										data={siteOf(siteApplications.slice(0, 12), euWest)}
										only="applications"
									/>
								</div>
							</State>
						</Part>
					</Tile>
				</div>
			</Page>
		</Accepted.Provider>
	);
}

/**
 * The applications of the site view with two out of contact, and two with only
 * some of their nodes in contact.
 */
const someOut = withContact(siteApplications, {
	out: ["kyc", "payroll"],
	partly: { orders: 0.5, payments: 0.67 },
});

/**
 * SiteDemo is the site view, or only its applications tile, with heartbeats that
 * arrive from each application that is in contact, each at its own pace, as they
 * do on the view, so that its chart moves.
 */
function SiteDemo({ data, only }: { data: SiteData; only?: "applications" }) {
	const beats = useRef(
		new Map<string, { next: number; interval: number; beats: number[] }>(),
	);
	const [receivedAt, setReceivedAt] = useState(() => performance.now());

	useEffect(() => {
		const timer = window.setInterval(() => {
			const now = performance.now();
			let beat = false;

			for (const a of data.applications) {
				if (a.nodes === 0) {
					continue;
				}
				const key = a.application.key;
				const b = beats.current.get(key) ?? {
					interval: 1500 + Math.random() * 2000,
					next: now + Math.random() * 2000,
					beats: [],
				};
				if (now >= b.next) {
					beat = true;
					b.beats = [...b.beats, now].slice(-9);
					b.next = now + b.interval * (0.9 + Math.random() * 0.2);
				}
				beats.current.set(key, b);
			}

			if (beat) {
				setReceivedAt(now);
			}
		}, 50);

		return () => window.clearInterval(timer);
	}, [data]);

	const live: SiteData = {
		...data,
		applications: data.applications.map((a) => ({
			...a,
			heartbeats:
				a.nodes === 0
					? []
					: (beats.current.get(a.application.key)?.beats ?? []).map(
							(t) => receivedAt - t,
						),
		})),
	};

	return (
		<LiveData receivedAt={receivedAt}>
			{only === "applications" ? (
				<ApplicationsTile data={live} />
			) : (
				<SiteOverview data={live} />
			)}
		</LiveData>
	);
}

/** A node that the demonstration of the cluster tile adds, and its heartbeats. */
interface DemoNode {
	id: string;
	workloads: number;

	/** The usual time between its heartbeats, in milliseconds. */
	interval: number;

	/** When it next beats, on the browser's clock. */
	next: number;

	/** The times of its latest heartbeats, oldest first, on the browser's clock. */
	beats: number[];
}

/** The most nodes that the demonstration adds. */
const demoNodes = 8;

/**
 * A cluster tile that has no node, to which nodes can be added and from which they
 * can be taken away, as nodes join and leave a cluster. Each node beats at its own
 * pace while it is there, and each beat is data that arrives, as it does on the
 * cluster's page.
 */
function Nodes({ application }: { application: Application }) {
	const nodes = useRef<DemoNode[]>([]);
	const added = useRef(0);
	const [receivedAt, setReceivedAt] = useState(() => performance.now());

	useEffect(() => {
		const timer = window.setInterval(() => {
			const now = performance.now();
			let beat = false;

			for (const n of nodes.current) {
				if (now >= n.next) {
					beat = true;
					n.beats = [...n.beats, now].slice(-9);
					n.next = now + n.interval * (0.9 + Math.random() * 0.2);
				}
			}

			if (beat) {
				setReceivedAt(now);
			}
		}, 50);

		return () => window.clearInterval(timer);
	}, []);

	const add = () => {
		if (nodes.current.length >= demoNodes) {
			return;
		}

		const now = performance.now();
		added.current++;
		nodes.current = [
			...nodes.current,
			{
				// Ascending, because the page lists nodes by ID.
				id: `00000000-0000-4000-8000-${String(added.current).padStart(12, "0")}`,
				workloads: 1 + Math.floor(Math.random() * 3),
				interval: 1500 + Math.random() * 2000,
				next: now + 1500 + Math.random() * 2000,
				beats: [now],
			},
		];
		setReceivedAt(now);
	};

	const remove = (all: boolean) => {
		nodes.current = all ? [] : nodes.current.slice(0, -1);
		setReceivedAt(performance.now());
	};

	return (
		<div className="flex flex-col gap-3">
			<LiveData receivedAt={receivedAt}>
				<ClusterTile
					application={application}
					data={{
						reportsWorkloads: true,
						nodes: nodes.current.map((n) => ({
							id: n.id,
							workloads: n.workloads,
							heartbeats: n.beats.map((t) => receivedAt - t),
						})),
					}}
					href={undefined}
				/>
			</LiveData>
			<div className="flex flex-wrap gap-2">
				<button
					type="button"
					className={button}
					disabled={nodes.current.length >= demoNodes}
					onClick={add}
				>
					Add a node
				</button>
				<button
					type="button"
					className={button}
					disabled={nodes.current.length === 0}
					onClick={() => remove(false)}
				>
					Remove a node
				</button>
				<button
					type="button"
					className={button}
					disabled={nodes.current.length === 0}
					onClick={() => remove(true)}
				>
					Remove them all
				</button>
			</div>
		</div>
	);
}

/** The application, at a site. */
/** The data of the cluster tile, with the given number of the fixture's nodes. */
function clusterTile(nodes: number): NonNullable<OverviewData["cluster"]> {
	return {
		...overview.cluster,
		nodes: overview.cluster.nodes.slice(0, nodes),
	};
}

/** The data of the events tile, with the given rate, or without one. */
/** A figure at the size of a headline, with buttons that do things to it. */
/** A card of a process, with buttons that change the numbers on it. */
/** A count of failing messages after a number, with buttons that change it. */
/** The code of the tile that the parts inside it are of, for their IDs. */
const TileCode = createContext("");

/**
 * Tile is the part of the page about one tile: its states, and then its parts, in
 * the order that they are reviewed. `code` is the start of the ID of each state
 * that is drawn inside it, such as "CL" for "CL 4A".
 */
function Tile({
	code,
	title,
	note,
	children,
}: {
	code: string;
	title: string;
	note: string;
	children: ReactNode;
}) {
	const { ids } = useContext(Accepted);
	const parts = Children.toArray(children).filter(
		(c): c is ReactElement<PartProps> => isValidElement(c) && c.type === Part,
	);
	const settled =
		parts.length > 0 &&
		parts.every((part) => partSettled(code, part.props, ids));

	return (
		<Collapsible
			settled={settled}
			className="grid gap-8"
			summary={
				<div>
					<h2 className="flex items-center gap-2 text-lg font-semibold">
						<ReviewId id={code} />
						{title}
						{settled && <Decision decided />}
					</h2>
					<p className="text-muted">{note}</p>
				</div>
			}
		>
			<TileCode.Provider value={code}>{children}</TileCode.Provider>
		</Collapsible>
	);
}

/**
 * Collapsible is a section of the page that can be collapsed to its heading. It
 * is collapsed while `settled`, until the reviewer opens or closes it.
 */
function Collapsible({
	settled,
	summary,
	className,
	children,
}: {
	settled: boolean;
	summary: ReactNode;
	className?: string;
	children: ReactNode;
}) {
	const [open, setOpen] = useOpenUnlessSettled(settled);

	return (
		<details
			open={open}
			onToggle={(e) => {
				// The browser also says when the page opens or closes it, which
				// isn't the reviewer's choice.
				if (e.currentTarget.open !== open) {
					setOpen(e.currentTarget.open);
				}
			}}
		>
			<summary className="flex cursor-pointer list-none items-start gap-2 [&::-webkit-details-marker]:hidden">
				<Icon
					name="chevron"
					className={cn(
						"mt-1 size-4 flex-none text-muted transition-transform motion-reduce:transition-none",
						open && "rotate-90",
					)}
				/>
				<div className="min-w-0 flex-1">{summary}</div>
			</summary>
			<div className={cn("mt-4 pl-6", className)}>{children}</div>
		</details>
	);
}

/**
 * useOpenUnlessSettled keeps whether something is open. Until the reviewer opens
 * or closes it, it follows the decisions: closed while `settled`, and open
 * otherwise, so that something collapses as soon as it is fully decided, and
 * opens again if a decision is undone. Once the reviewer opens or closes it, it
 * stays as they left it.
 */
function useOpenUnlessSettled(settled: boolean) {
	const { loaded } = useContext(Accepted);
	const [choice, setChoice] = useState<boolean | undefined>(undefined);
	const open = choice ?? !(loaded && settled);

	return [open, setChoice] as const;
}

/**
 * partSettled returns true if everything in a part that asks for a decision has
 * one: the part is marked decided, or its recommendation and that of each of its
 * states that is under review is accepted, or one of a state's alternatives is
 * used in its place. A part with nothing to decide is settled only if it is
 * marked decided.
 */
function partSettled(
	tile: string,
	{ step, decided, recommendation, children }: PartProps,
	ids: ReadonlySet<string>,
): boolean {
	if (decided === true) {
		return true;
	}

	const part = `${tile} ${step ?? 0}`;
	const kids = Children.toArray(children);

	// The letters of the states whose alternatives one has been used in place of.
	const replaced = new Set(
		kids.flatMap((c) =>
			isValidElement<ChoicesProps>(c) &&
			c.type === Choices &&
			c.props.choices.some((_, i) => ids.has(`${part}${c.props.of}${i + 1}`))
				? [c.props.of]
				: [],
		),
	);

	const needs: boolean[] = [];
	if (recommendation !== undefined) {
		needs.push(ids.has(part));
	} else if (decided === false) {
		needs.push(false);
	}
	kids.forEach((c, i) => {
		if (!isValidElement<StateProps>(c) || c.type !== State) {
			return;
		}
		const { decided: d, recommendation: r } = c.props;
		if (d === true) {
			return;
		}
		if (r !== undefined || d === false) {
			const letter = String.fromCharCode(65 + i);
			needs.push(ids.has(`${part}${letter}`) || replaced.has(letter));
		}
	});

	return needs.length > 0 && needs.every(Boolean);
}

/**
 * Part is one part of a tile, with what it shows in each of its states. `step` is
 * its place in the order of review, from the least specific to the most, and is 0
 * for the tile as a whole. Each state inside it is given an ID that is unique on
 * the page: the tile's code, the step, and a letter for its place, such as "CL 4A".
 * The states come before any choices, so that a state's letter is its place. `decided` says whether the part is settled, or still under
 * review, if all of its states are one or the other; otherwise each state says.
 *
 * The states are in a grid whose rows are shared, so that the states in one row
 * line up, whatever the length of their notes.
 */
type PartProps = {
	step?: number;
	title: string;
	note?: string;
	decided?: boolean;

	/** What the reviewer is recommended to decide, if the part is under review. */
	recommendation?: string;

	children?: ReactNode;
};

function Part(props: PartProps) {
	const { step, title, note, decided, recommendation, children } = props;
	const tile = useContext(TileCode);
	const { ids } = useContext(Accepted);
	const settled = partSettled(tile, props, ids);

	return (
		<Collapsible
			settled={settled}
			summary={
				<div>
					<h3 className="flex items-center gap-2 font-semibold">
						{step !== undefined && <ReviewId id={`${tile} ${step}`} />}
						<span>{title}</span>
						{settled ? (
							<Decision decided />
						) : (
							decided !== undefined && <Decision decided={decided} />
						)}
					</h3>
					{note && <p className="text-sm text-muted">{note}</p>}
				</div>
			}
		>
			{recommendation && (
				<Recommendation id={`${tile} ${step ?? 0}`} className="mb-4">
					{recommendation}
				</Recommendation>
			)}
			{children && (
				<div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] items-start gap-x-6 gap-y-2">
					{Children.toArray(children).map((child, i) =>
						isValidElement<{ id?: string }>(child) && child.type === State
							? cloneElement(child, {
									id: `${tile} ${step ?? 0}${String.fromCharCode(65 + i)}`,
								})
							: isValidElement<{ part?: string }>(child) &&
									child.type === Choices
								? cloneElement(child, { part: `${tile} ${step ?? 0}` })
								: child,
					)}
				</div>
			)}
		</Collapsible>
	);
}

/**
 * State is one state of a part, with what causes it. It takes two rows of its
 * part's grid, one for its caption and one for what it shows, and shares them with
 * the states beside it, so that what they show starts at the same height.
 * `decided` says whether the state is settled, if its part doesn't say for all of
 * its states.
 */
type StateProps = {
	/** The ID of the state on the page, which its part gives it. */
	id?: string;

	label: string;
	note?: string;

	/** True for a state that takes the whole width of its section. */
	wide?: boolean;

	decided?: boolean;

	/** What the reviewer is recommended to decide about this state, if anything. */
	recommendation?: string;

	children: ReactNode;
};

function State({
	id,
	label,
	note,
	wide = false,
	decided,
	recommendation,
	children,
}: StateProps) {
	const { ids } = useContext(Accepted);

	// A state with a recommendation is under review, unless it says otherwise, or
	// its recommendation is accepted.
	const accepted = id !== undefined && ids.has(id);
	const status =
		accepted || (decided ?? (recommendation === undefined ? undefined : false));

	// A decided state shows only its caption until it is opened.
	const [open, setOpen] = useOpenUnlessSettled(status === true);

	return (
		<figure
			className={cn(
				"row-span-2 grid grid-rows-subgrid",
				wide && "col-span-full",
			)}
		>
			<figcaption>
				<span className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold">
					<button
						type="button"
						className="flex-none cursor-pointer text-muted"
						aria-expanded={open}
						aria-label={`${open ? "Collapse" : "Expand"} ${id ?? label}`}
						onClick={() => setOpen(!open)}
					>
						<Icon
							name="chevron"
							className={cn(
								"size-4 transition-transform motion-reduce:transition-none",
								open && "rotate-90",
							)}
						/>
					</button>
					{id !== undefined && <ReviewId id={id} />}
					{label}
					{status !== undefined && <Decision decided={status} />}
				</span>
				{note && <span className="block text-xs text-muted">{note}</span>}
				{recommendation && (
					<Recommendation id={id ?? label} className="mt-1.5">
						{recommendation}
					</Recommendation>
				)}
			</figcaption>
			<div className="mb-6">{open && children}</div>
		</figure>
	);
}

/**
 * Choices is a row of alternatives to what a state of a part shows, such as other
 * wordings, below the part's states, so that they aren't read as more states, or
 * as a second decision. `of` is the letter of the state that they change, and each choice has
 * that state's ID with its own number, such as "CL 4C1". The state shows the
 * recommended choice, so the row holds only the others, each of which can be
 * accepted in its place. `title` says what is being chosen, as in "Choices for
 * the status".
 */
type ChoicesProps = {
	/** The ID of the part, which the part gives it. */
	part?: string;

	of: string;
	title: string;
	choices: readonly (readonly [label: string, shows: ReactNode])[];

	/** False if each choice draws its own frames, such as several cards. */
	framed?: boolean;
};

function Choices({ part, of, title, choices, framed = true }: ChoicesProps) {
	return (
		<div className="col-span-full mt-2 mb-4 rounded-card border border-dashed border-line-strong p-4">
			<h4 className="text-sm font-semibold text-fg-soft">
				Alternatives to {`${part}${of}`}, for {title}
			</h4>
			<p className="mb-3 text-xs text-muted">
				One decision: accept {`${part}${of}`} as it is, or one of these in its
				place.
			</p>
			<div
				className={cn(
					"grid items-start gap-x-6 gap-y-6",
					framed
						? "grid-cols-[repeat(auto-fill,minmax(280px,1fr))]"
						: "grid-cols-1",
				)}
			>
				{choices.map(([label, shows], i) => (
					<Alternative
						key={label}
						id={`${part}${of}${i + 1}`}
						to={`${part}${of}`}
						others={choices.map((_, j) => `${part}${of}${j + 1}`)}
						label={label}
					>
						{framed ? <Panel>{shows}</Panel> : shows}
					</Alternative>
				))}
			</div>
		</div>
	);
}

/**
 * Alternative is one of the alternatives to what the state `to` shows. It has a
 * quiet button that uses it in place of that state, and not a recommendation,
 * because the state carries the recommendation. Once the state, or any of
 * `others`, is accepted, the decision is made: the one chosen says so, and the
 * rest fade and lose their button.
 */
function Alternative({
	id,
	to,
	others,
	label,
	children,
}: {
	id: string;
	to: string;
	others: readonly string[];
	label: string;
	children: ReactNode;
}) {
	const { ids, accept, withdraw } = useContext(Accepted);
	const chosen = ids.has(id);
	const decided = ids.has(to) || others.some((o) => ids.has(o));

	return (
		<figure className={cn("grid gap-2", decided && !chosen && "opacity-40")}>
			<figcaption className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold">
				<ReviewId id={id} />
				{label}
			</figcaption>
			{children}
			{chosen ? (
				<span className="inline-flex items-center gap-2 text-xs">
					<span className="inline-flex items-center gap-1 font-semibold text-accent">
						<Icon name="check" className="size-3" />
						Used in place of {to}
					</span>
					<Undo id={id} withdraw={withdraw} />
				</span>
			) : (
				!decided && (
					<button
						type="button"
						className="justify-self-start cursor-pointer rounded-control border border-line bg-panel px-2 py-0.5 text-xs text-fg-soft hover:border-line-strong hover:text-fg"
						onClick={() => accept(id, `Use ${id} in place of ${to}.`)}
					>
						Use this instead
					</button>
				)
			)}
		</figure>
	);
}

/**
 * ContactCard draws the card of the cluster's nodes or of the engine, with `text`
 * in the place that `card` names, and the card's other words as recommended, so
 * that one place's words can be judged on their own.
 */
function ContactCard({
	card,
	text,
}: {
	card:
		| "nodes-paragraph"
		| "nodes-status"
		| "engine-online"
		| "engine-figures"
		| "engine-status";
	text: string;
}) {
	if (card === "nodes-paragraph" || card === "nodes-status") {
		return (
			<Panel>
				<InfoCard
					subsystem="cluster"
					icon="node"
					kind="Cluster nodes"
					status={{
						icon: "alert",
						text:
							card === "nodes-status"
								? text
								: "Every node is out of contact, so it's unknown whether the application is working.",
					}}
				>
					<p>
						{card === "nodes-paragraph"
							? text
							: "The number of nodes that are in contact now. A node is one running process of the application's engine. Together, the nodes form a cluster that shares the application's work."}
					</p>
				</InfoCard>
			</Panel>
		);
	}

	return (
		<Panel>
			<InfoCard
				subsystem="cluster"
				icon="engine"
				kind="Engine"
				status={{
					icon: "alert",
					text:
						card === "engine-status"
							? text
							: "The engine is out of contact, so it's unknown whether the application is working.",
				}}
			>
				<p>
					{card === "engine-status"
						? "The engine is online while it is in contact, so the figures shown are current."
						: text}
				</p>
			</InfoCard>
		</Panel>
	);
}

/** The look of a button that drives a demonstration on this page. */
const button =
	"cursor-pointer rounded-control border border-line bg-panel px-3 py-1.5 text-sm text-fg-soft hover:border-line-strong disabled:cursor-default disabled:opacity-40";

/** How many nodes the cluster of [CoverageDemo] has. */
const coverageNodes = 4;

/**
 * CoverageDemo is the events tile of a cluster of four nodes, with buttons that
 * stop and start nodes reporting what the tile shows, so that the blur and the
 * glitch of the coverage rule can be seen.
 */
function CoverageDemo() {
	const [reporting, setReporting] = useState(coverageNodes - 1);

	return (
		<div className="grid gap-3">
			<Covered coverage={reporting / coverageNodes}>
				<EventsTile
					application={application}
					data={overview.events}
					href={undefined}
				/>
			</Covered>
			<p className="text-xs text-muted">
				{reporting} of {coverageNodes} nodes report what the tile shows.
			</p>
			<div className="flex flex-wrap gap-2">
				<button
					type="button"
					className={button}
					disabled={reporting === 1}
					onClick={() => setReporting(reporting - 1)}
				>
					A node stops reporting
				</button>
				<button
					type="button"
					className={button}
					disabled={reporting === coverageNodes}
					onClick={() => setReporting(reporting + 1)}
				>
					A node starts reporting
				</button>
			</div>
		</div>
	);
}

/** The ID of the node that the cards of a node on this page are of. */
const nodeId = "113cbdc3-5b2d-4e8a-a1c6-0d4b8e2f7a93";

/**
 * NodeCardWith is the card of a node on the cluster tile's bar, with other words
 * than its own, for a choice of wording: `paragraphs` for one that owns three of
 * five workloads, or `status` for one that doesn't report its workloads.
 */
function NodeCardWith({
	paragraphs,
	status,
}: {
	paragraphs?: readonly string[];
	status?: string;
}) {
	return (
		<InfoCard
			subsystem="cluster"
			icon="node"
			kind="Node"
			identifier={<Identifier id={nodeId} of="node" />}
			figure={
				paragraphs && {
					value: <Ramped value={3} format={formatCompact} />,
					unit: "workloads",
					aside: <Ramped value={0.6} format={formatPercent} />,
				}
			}
			status={
				status === undefined ? undefined : { icon: "alert", text: status }
			}
		>
			{paragraphs?.map((p) => (
				<p key={p}>{p}</p>
			))}
		</InfoCard>
	);
}

/** EventsIconCard is the card of the events tile's icon, with `status`. */
function EventsIconCard({ status }: { status: string }) {
	return (
		<InfoCard
			subsystem="streams"
			icon="event"
			kind="Events"
			status={{ icon: "alert", text: status }}
		>
			{eventsAbout(application)}
		</InfoCard>
	);
}

/** How long the ID of a state shows that it has been copied, in milliseconds. */
const copiedTime = 1500;

/**
 * ReviewId is the ID of a tile, a part or a state on the page, in full, which a
 * click copies, so that it can be pasted into a review. A copy icon beside it says so, and is a tick for a moment once it
 * has copied.
 */
function ReviewId({ id }: { id: string }) {
	const [copied, setCopied] = useState(false);
	const timer = useRef<number | undefined>(undefined);

	useEffect(() => () => window.clearTimeout(timer.current), []);

	async function copy() {
		try {
			await navigator.clipboard.writeText(id);
		} catch {
			// The page has no permission to write to the clipboard.
			return;
		}

		setCopied(true);
		window.clearTimeout(timer.current);
		timer.current = window.setTimeout(() => setCopied(false), copiedTime);
	}

	return (
		<button
			type="button"
			className="inline-flex flex-none cursor-pointer items-center gap-1 rounded-control bg-sunk px-1.5 text-xs text-fg-soft transition-colors duration-150 hover:bg-line hover:text-fg motion-reduce:transition-none"
			aria-label={copied ? `Copied ${id}` : `Copy ${id}`}
			onClick={copy}
		>
			<span className="font-mono">{id}</span>
			<Icon name={copied ? "check" : "copy"} className="size-3" />
		</button>
	);
}

/**
 * Accepted is what the page knows of the recommendations that the reviewer has
 * accepted, by the ID of what each is about, and a way to accept one.
 */
const Accepted = createContext<{
	ids: ReadonlySet<string>;

	/** True once the decisions that the dev server keeps have been read. */
	loaded: boolean;

	accept: (id: string, recommendation: string) => void;
	withdraw: (id: string) => void;
}>({ ids: new Set(), loaded: false, accept: () => {}, withdraw: () => {} });

/**
 * acceptedIn returns the IDs of what the decisions that the dev server keeps
 * accept, as they stand after the last of them: a decision that withdraws an
 * acceptance undoes it. Anything that isn't such a decision is left out.
 */
function acceptedIn(decisions: unknown): ReadonlySet<string> {
	const ids = new Set<string>();
	if (!Array.isArray(decisions)) {
		return ids;
	}

	for (const d of decisions) {
		if (
			typeof d !== "object" ||
			d === null ||
			!("id" in d) ||
			typeof d.id !== "string" ||
			!("decision" in d)
		) {
			continue;
		}
		if (d.decision === "accepted") {
			ids.add(d.id);
		} else if (d.decision === "withdrawn") {
			ids.delete(d.id);
		}
	}

	return ids;
}

/**
 * useAccepted keeps the recommendations that the reviewer has accepted, which the
 * dev server keeps in a file that the agent that the review is with reads. Without
 * the dev server, such as in a test, nothing is accepted, and accepting does
 * nothing that lasts.
 */
function useAccepted() {
	const [ids, setIds] = useState<ReadonlySet<string>>(new Set());
	const [loaded, setLoaded] = useState(false);

	const remember = (decisions: unknown) => setIds(acceptedIn(decisions));

	// The decisions are read again whenever the page is looked at again, because
	// the agent that the review is with may have changed the file meanwhile.
	useEffect(() => {
		const load = () =>
			fetch("/__review/decisions")
				.then((r) => r.json())
				.then((decisions) => setIds(acceptedIn(decisions)))
				.finally(() => setLoaded(true))
				.catch(() => {});

		load();
		window.addEventListener("focus", load);
		return () => window.removeEventListener("focus", load);
	}, []);

	const accept = (id: string, recommendation: string) => {
		setIds((before) => new Set([...before, id]));
		fetch("/__review/decisions", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ id, decision: "accepted", recommendation }),
		})
			.then((r) => r.json())
			.then(remember)
			.catch(() => {});
	};

	const withdraw = (id: string) => {
		setIds((before) => new Set([...before].filter((i) => i !== id)));
		fetch("/__review/decisions", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ id, decision: "withdrawn" }),
		})
			.then((r) => r.json())
			.then(remember)
			.catch(() => {});
	};

	return { ids, loaded, accept, withdraw };
}

/**
 * Recommendation is what the reviewer is recommended to decide about something
 * under review, `id`, in the accent color of being under review, with a button
 * that accepts it. Once it is accepted, the button says so.
 */
function Recommendation({
	id,
	className,
	children,
}: {
	id: string;
	className?: string;
	children: string;
}) {
	const { ids, accept, withdraw } = useContext(Accepted);
	const accepted = ids.has(id);

	return (
		<div
			className={cn(
				"flex max-w-3xl items-start gap-3 rounded-control bg-accent-soft px-2.5 py-1.5 text-xs font-normal text-fg-soft",
				className,
			)}
		>
			<p className="flex-1">
				<span className="font-semibold text-accent">Recommendation: </span>
				{children}
			</p>
			{accepted ? (
				<span className="inline-flex flex-none items-center gap-2">
					<span className="inline-flex items-center gap-1 font-semibold text-accent">
						<Icon name="check" className="size-3" />
						Accepted
					</span>
					<Undo id={id} withdraw={withdraw} />
				</span>
			) : (
				<button
					type="button"
					className="flex-none cursor-pointer rounded-control bg-accent px-2 py-0.5 font-semibold text-[#fff] hover:opacity-90"
					aria-label={`Accept the recommendation for ${id}`}
					onClick={() => accept(id, children)}
				>
					Accept
				</button>
			)}
		</div>
	);
}

/**
 * Undo withdraws the acceptance of `id`, so that it is under review again.
 */
function Undo({
	id,
	withdraw,
}: {
	id: string;
	withdraw: (id: string) => void;
}) {
	return (
		<button
			type="button"
			className="cursor-pointer text-fg-soft underline decoration-dotted underline-offset-2 hover:text-fg"
			aria-label={`Undo the acceptance of ${id}`}
			onClick={() => withdraw(id)}
		>
			Undo
		</button>
	);
}

/**
 * Decision marks something as settled, in muted grey with a tick, or as still
 * under review, in the accent color, so that a review goes to what is open.
 */
function Decision({ decided }: { decided: boolean }) {
	return decided ? (
		<span className="inline-flex flex-none items-center gap-1 rounded-full bg-sunk px-2 py-0.5 whitespace-nowrap text-2xs font-semibold tracking-[0.06em] text-muted uppercase">
			<Icon name="check" className="size-3" />
			Decided
		</span>
	) : (
		<span className="inline-flex flex-none items-center rounded-full bg-accent-soft px-2 py-0.5 whitespace-nowrap text-2xs font-semibold tracking-[0.06em] text-accent uppercase">
			Under review
		</span>
	);
}

/** A popover where it stands, in the frame of a panel. */
function Panel({ children }: { children: ReactNode }) {
	return <div className={`w-fit ${panelClasses}`}>{children}</div>;
}
