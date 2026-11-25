import {
	Fragment,
	type ReactNode,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { application, overview } from "../fixtures/overview.ts";
import {
	euWest,
	siteApplications,
	siteOf,
	withSignal,
} from "../fixtures/site.ts";
import { cn } from "../lib/cn.ts";
import { Covered } from "../lib/distrust.tsx";
import { formatCompact, shortId } from "../lib/format.ts";
import { LiveData } from "../lib/live.tsx";
import type {
	Application,
	LiveNode,
	OverviewData,
	SiteApplication,
	SiteData,
} from "../model.ts";
import { ApplicationName } from "./ApplicationName.tsx";
import { noNodesText } from "./ClusterCards.tsx";
import { engineOutText } from "./EngineCard.tsx";
import { Explained, type ExplainerSpec } from "./Explainer.tsx";
import { ExplainersBuilt, TileFlag } from "./explained.ts";
import { HandlerDigest } from "./HandlerDigest.tsx";
import { Icon, type IconName } from "./Icon.tsx";
import { Identifier } from "./Identifier.tsx";
import { InfoCard } from "./InfoCard.tsx";
import {
	ClusterTile,
	EngineTile,
	EventsTile,
	QueuesTile,
	Totals,
} from "./Overview.tsx";
import { Popover, panelClasses } from "./Popover.tsx";
import { partialStatus } from "./partial.ts";
import { Choices, Panel, Part, Review, State, Tile } from "./review.tsx";
import { SegmentCard } from "./SegmentCard.tsx";
import {
	ApplicationsTile,
	CompactDigests,
	noSignalText,
	SiteBreakdown,
	SiteEventsTile,
	SiteOverview,
	SiteQueuesTile,
	SiteTotals,
} from "./SiteView.tsx";
import { NavGroup, type NavItem, TitleBar } from "./TitleBar.tsx";

/**
 * ReviewPage shows every state of the tiles that are being worked on, or that
 * have something undecided, side by side, so that a person reviewing a tile sees
 * all of them and not only the one that the data happens to be in. The tiles are
 * in the order in which their decisions depend on each other: what is open about
 * a layout first, then about states, then about words. Each tile is
 * shown whole, and then part by part, in the order of review, from the least
 * specific to the most, such as its bar and then its chart. A hovercard whose words never change, and that has a status in
 * some states, is shown once, with its status.
 *
 * A hovercard is drawn where it stands, in the frame of a panel, because a person
 * can't point at several at once.
 */
export function ReviewPage() {
	return (
		// Every card here is drawn as it will be once the explainers are in the
		// views, which the review designs for.
		<ExplainersBuilt value={true}>
			<Review>
				<Tile
					code="SL"
					title="Site view: layout"
					note="The view of a site, designed here before it is built, in chunks that are shown one at a time, each once the one before it is decided. This chunk is the layout only: the totals of the applications at the site as three tiles, the same size as the cluster view's, and each application below them, at the scale that the view is designed for, which is about a hundred applications. The figures are made up. The states, the words and the details come in later chunks."
				>
					<Part
						step={0}
						title="Tiles above, applications below"
						deciding="Where the view's parts go: the three tiles above, in a row, and the applications below them, in the order of their names."
						notDeciding={
							"What the tiles and the compact digests say, the made-up figures, the bars and the charts, which come in later chunks; how the view looks when messages fail or the signal stops (SS); whether the grid is of compact digests or of squares (SL 1)."
						}
						recommendation="Approve the layout. The tiles answer how busy the site is and whether anything is wrong, and the grid below answers where, with every application one click from its view."
						note="The three tiles are the events per minute, the messages waiting and the applications sending a signal. The applications are in the order of their names, so that an application keeps its place."
					>
						<State label="All applications sending a signal" wide>
							<SiteDemo data={siteOf(calm, euWest)} />
						</State>
					</Part>

					<Part
						step={1}
						title="The grid of applications"
						deciding="Whether each application below the tiles is a compact digest, with its name and figures, or a square in a grid that names it only when pointed at."
						notDeciding="What a compact digest's figures are, and its explainer, which is approved; the hovercard of its alert flag (SH 2); how a compact digest looks when its application's messages fail or its signal stops (SS); the order of the applications (SL 0)."
						note="Each application is a compact digest with its name, its events per minute and its messages waiting, which links to its application view. The alternative is the plan's first idea, a grid of squares like a contribution graph, which names an application only when it is pointed at."
					>
						<State
							label="Compact digests with names and figures"
							recommendation="Approve. A reader finds an application by its name at a glance, and sees its figures without pointing at it. A hundred compact digests fit in about a screen."
							wide
						>
							<SiteBreakdown
								data={siteOf(calm, euWest)}
								breakdown="compact-digests"
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
										data={siteOf(calm, euWest)}
										breakdown="squares"
									/>,
								],
							]}
						/>
					</Part>
				</Tile>

				<Tile
					code="SS"
					title="Site view: states"
					note="How the view looks as its applications' messages fail and as their signal stops: the accents, the blur and the words that take the place of a compact digest's figures. The words of the tiles' hovercards come in the next chunk."
				>
					<Part
						step={0}
						title="The view in each state"
						deciding="How the whole view looks in each state: when messages fail, when only some nodes report, and when the signal from one application, or from all of them, stops."
						notDeciding="The layout (SL); the words on the tiles (SH 1) and their explainers (SW); the bars (SB); the applications tile's chart (SC). All of them are shown, but none of them is decided here."
					>
						<State
							label="Three applications with failing messages"
							note="checkout, mailer and regulatory-reports have the orange accent and the orange &quot;+N&quot;, as a handler digest does, and so does the queues tile."
							recommendation="Approve, as the cluster view does it."
							wide
						>
							<SiteDemo data={siteOf(siteApplications, euWest)} />
						</State>
						<State
							label="Two applications with no signal, and two with only some nodes sending a signal"
							note="The two with no signal, kyc and payroll, have the red accent and a red alert icon at the right of their names, as tiles and handler digests have their icon there, and pointing at the icon shows a hovercard that says that there is no signal from the application, whose words are reviewed in SH 2. Their figures keep their places as blurry zeros, which glitch when the signal stops. The blur says how far a figure is trusted, and the red says that there is no signal. The figures of the two with only some nodes sending a signal, orders and payments, are blurred by the coverage rule, and so, slightly, are the totals. The applications tile's headline is the applications sending a signal, with those that send none set apart in red, as in &quot;94 +2&quot;, as the queues tile sets apart failing messages in orange, and the tile has the red accent while any application has no signal, because an application with no signal is one that nothing shows to be working, unlike a node, whose cluster's other nodes carry on."
							recommendation="Approve, with the icon. It takes no room from the name, so a long name isn't cut short, and its hovercard gives the words, as the status of a hovercard does elsewhere. The red accent and the icon mark an application with no signal as the cluster tile marks a cluster with no nodes, and the blur is the coverage rule's."
							wide
						>
							<SiteDemo data={siteOf(someOut, euWest)} />
						</State>
						<State
							label="No applications sending a signal"
							note="The totals are the last ones, distrusted, as a cluster's are when no nodes are sending a signal, and the applications tile's headline is a red 0 alone, with no &quot;+N&quot;, because when no applications are sending a signal there is nothing to set them apart from."
							recommendation="Approve, as the cluster view does it."
							wide
						>
							<SiteDemo
								data={siteOf(
									withSignal(siteApplications.slice(0, 18), {
										out: siteApplications
											.slice(0, 18)
											.map((a) => a.application.name),
									}),
									euWest,
								)}
							/>
						</State>
						<State
							label="One application"
							recommendation="Approve. The view keeps its layout, and each bar is one segment."
							wide
						>
							<SiteDemo data={siteOf(siteApplications.slice(81, 82), euWest)} />
						</State>
						<State
							label="Applications at no site"
							note="The view of the applications that run at no site, at the address of the site whose key is the nil UUID. It looks the same as a site's; its words, which say &quot;the applications that run at no site&quot;, are reviewed with the tiles' words."
							recommendation="Approve."
							wide
						>
							<SiteDemo
								data={siteOf(siteApplications.slice(40, 52), undefined)}
							/>
						</State>
						<Choices
							of="B"
							title="how a compact digest says that there is no signal"
							framed={false}
							choices={(
								[
									["Words beside the name: Contact lost", "Contact lost"],
									["Words beside the name: No contact", "No contact"],
									["Words beside the name: Offline", "Offline"],
								] as const
							).map(([label, words]) => [
								label,
								<CompactDigests
									key={label}
									data={siteOf(someOut.slice(44, 50), euWest)}
									alert={{ words }}
								/>,
							])}
						/>
					</Part>
				</Tile>

				<Tile
					code="IC"
					title="Which thing a hovercard is about"
					note="A rule for every hovercard that stays once the explainers are built, on every view: where a hovercard says which thing it is about. It comes first, because the hovercards that stay follow it: those of the bars' segments."
				>
					<Part
						step={1}
						title="The thing's name, or its ID, over its kind"
						deciding="Where every hovercard that stays says which thing it is about: the thing's name in bold capitals first, as a digest has it, then its kind. A thing with no name has its ID in the place of the name, in the same style, shortened, with a copy button that says what it copied. A thing that has a name shows no ID or key."
						notDeciding="The other words of each segment's hovercard, which are decided with them (SB, and the bars of EV, QU and CL); how an ID is shortened, which is settled; the alert flags, which open a tooltip of their status (SH 2, FL)."
						note="Once the explainers are built, the hovercards that stay are the drill-downs of a bar's segments, each about one stream, queue, node or application. The moon's hovercard follows the same rule. No icon opens a hovercard, an alert flag opens a tooltip of its status, a digest shows no key, and the cluster's or the engine's ID is in the title bar (ID). The design doc already says that &quot;figures and identity have their own places, and are never inside a sentence&quot;."
					>
						<State
							label="The hovercards of the cluster view's and the site view's bars"
							note="Every hovercard of a segment about one thing, on the cluster view's and the site view's bars, as it will be once the explainers are in the views: without what it says about the bar or its advice, which the card's explainer says instead."
							recommendation="Approve the rule as these hovercards show it: the name, or for a thing with no name its ID, first, in bold capitals, then the kind; no key for a thing with a name."
							wide
						>
							<div className="flex flex-col gap-8">
								<Captioned2 title="The cluster view's bars">
									<Captioned caption="A stream, on the events bar">
										<SegmentCard
											paragraphs={false}
											about={{
												thing: "event-stream",
												id: "8b0081fd-3f1c-4e8a-9d57-0b1c6a2e4f10",
												amount: 612,
												share: 0.42,
												total: { amount: 1457, things: 3 },
											}}
										/>
									</Captioned>
									<Captioned caption="A queue, on the queues bar">
										<SegmentCard
											paragraphs={false}
											about={{
												thing: "queue",
												id: "c42e7a19-5d0b-4f3a-8e61-7b2d9f0a3c85",
												amount: 240,
												share: 0.65,
												total: { amount: 370, things: 2 },
											}}
										/>
									</Captioned>
									<Captioned caption="A node, on the cluster bar">
										<SegmentCard
											paragraphs={false}
											about={{
												thing: "node",
												id: nodeId,
												amount: 2,
												share: 0.4,
												total: { amount: 5, things: 3 },
											}}
										/>
									</Captioned>
									<Captioned caption="A node that doesn't report its workloads, on the cluster bar">
										<SegmentCard
											paragraphs={false}
											about={{ thing: "node", id: nodeId, unreported: true }}
										/>
									</Captioned>
								</Captioned2>
								<Captioned2 title="The site view's bars">
									<Captioned caption="An application, on the events bar">
										<SegmentCard
											paragraphs={false}
											about={{
												thing: "application",
												of: "events",
												application: {
													name: "payments",
													key: "a41f9c3e-7b2d-4e6a-8c15-3d9e0b7f2a64",
												},
												amount: 2140,
												share: 0.1834,
											}}
										/>
									</Captioned>
									<Captioned caption="An application, on the queues bar">
										<SegmentCard
											paragraphs={false}
											about={{
												thing: "application",
												of: "messages",
												application: {
													name: "payments",
													key: "a41f9c3e-7b2d-4e6a-8c15-3d9e0b7f2a64",
												},
												amount: 38,
												share: 0.12,
											}}
										/>
									</Captioned>
								</Captioned2>
							</div>
						</State>
						<State
							label="The handler digests' bars"
							note="Today each segment of a handler digest's bar has a tooltip of one line, with the ID inside the sentence: &quot;100 instances on event stream 8b0081fd ⧉&quot; on an aggregate's bar, &quot;20 instances on deadline queue c42e7a19 ⧉&quot; on a process's, and &quot;120 commands/min on node 113cbdc3 ⧉&quot; on an integration's or a projection's. These follow the rule instead, as cards with the ID in the place of a name, the kind, and the figure. They have no paragraphs, as the digest's explainer says what the bar is."
							recommendation="Approve: make these segments drill down the way the cluster view's do, so that every segment about one thing follows the rule."
							wide
						>
							<div className="flex flex-wrap items-start gap-6">
								<Captioned caption="A stream, on an aggregate's bar">
									<InfoCard
										subsystem="streams"
										icon="event-stream"
										kind="Event stream"
										id={{
											id: "8b0081fd-3f1c-4e8a-9d57-0b1c6a2e4f10",
											what: "event stream ID",
										}}
										figure={{ value: "100", unit: "instances", aside: "50%" }}
									/>
								</Captioned>
								<Captioned caption="A deadline queue, on a process's bar">
									<InfoCard
										subsystem="queues"
										icon="queue"
										kind="Deadline queue"
										id={{
											id: "c42e7a19-5d0b-4f3a-8e61-7b2d9f0a3c85",
											what: "deadline queue ID",
										}}
										figure={{ value: "20", unit: "instances", aside: "100%" }}
									/>
								</Captioned>
								<Captioned caption="A node, on an integration's bar">
									<InfoCard
										subsystem="cluster"
										icon="node"
										kind="Node"
										id={{ id: nodeId, what: "node ID" }}
										figure={{
											value: "120",
											unit: "commands per minute",
											aside: "60%",
										}}
									/>
								</Captioned>
							</div>
						</State>
						<State
							label="Segments that are about no one thing"
							note="The last segment of a bar that has more things than it can draw merges the rest, and a handler's instances that aren't bound yet have a segment of their own. Neither is about one thing, so the rule doesn't apply, and each has a tooltip of one line, as today."
							recommendation="Approve: these keep their tooltips."
							wide
						>
							<div className="flex flex-wrap items-start gap-6">
								<Captioned caption="The merged segment, on the cluster view's events bar">
									<Tip>1.2K events on 4 other event streams</Tip>
								</Captioned>
								<Captioned caption="Instances not yet bound, on an aggregate's bar">
									<Tip>3 instances with no event stream yet</Tip>
								</Captioned>
							</div>
						</State>
					</Part>
				</Tile>

				<Tile
					code="LK"
					title="What is a link"
					note="Which part of a card that leads to another page is a link. A compact digest on the site view leads to its application's view; a handler digest leads to its handler's page once there is one. No vital card links anywhere yet."
				>
					<Part
						step={1}
						title="A card's name is its link"
						deciding="That on a card that leads to another page, only the thing's name is a link, and the card as a whole doesn't react to the pointer; and that the name shows that it leads to another page while it is pointed at or has the keyboard's focus: it is underlined, and a chevron appears after it. On a screen that is touched, the chevron is always there, and tapping the name or the kind follows the link."
						notDeciding="How a vital card links to its page, as it shows no name, and none links anywhere yet."
						note="A screen that is touched can't point, so the chevron is what says there that a name leads elsewhere. The handler digest here links nowhere, as no handler has a page yet."
					>
						<State
							label="Compact digests"
							recommendation="Approve. Point at a name to see it: only the name leads elsewhere, and it says so."
							wide
						>
							<div className="max-w-xl">
								<CompactDigests
									data={siteOf(siteApplications.slice(0, 3), euWest)}
									alert="icon"
								/>
							</div>
						</State>
						<State
							label="A handler digest"
							recommendation="Approve, as for compact digests."
						>
							<div className="w-80">
								<HandlerDigest
									application={application}
									handler={
										overview.handlers[0] as OverviewData["handlers"][number]
									}
									href="#"
								/>
							</div>
						</State>
						<Choices
							of="A"
							title="how a name shows that it leads to another page"
							framed={false}
							choices={(
								[
									["Underlined, without a chevron", "underline"],
									["A chevron, without an underline", "chevron"],
									["In the accent color, with a chevron", "accent"],
								] as const
							).map(([label, look]) => [
								label,
								<PointedName key={label} look={look} />,
							])}
						/>
					</Part>
				</Tile>

				<Tile
					code="SB"
					title="Site view: the bars"
					note="The hovercard of a segment of the events and queues tiles' bars."
				>
					<Part
						step={1}
						title="The bars"
						deciding="What the bars of the events and queues tiles show: a segment for each of the busiest applications and one for the rest, where the events tile's bar divides the rate of new events, as its headline does, and not the events stored, as the cluster view's bar of streams does; and the figures of a segment's hovercard."
						notDeciding="How a bar is drawn and shaded, which is as on the cluster view; where a hovercard puts the application's name and kind, which is IC; that a hovercard has no words about the bar, which the tiles' explainers say (SW); that the applications tile has no bar (SL); the alert flag's tooltip (SH 2)."
						note="The bars of the events and queues tiles have a segment for each of the busiest applications, largest first, and one for the rest, as a cluster's bars do for streams and queues. A segment's hovercard drills down: the application's name, its amount and its share. With about a hundred applications, the grey segment for the rest takes most of each bar, and whether that is acceptable is part of this decision."
					>
						<State
							label="Pointing at an application on the events bar"
							recommendation="Approve. It drills down to the application: its events per minute and its share of them."
						>
							<Panel>
								<SegmentCard
									paragraphs={false}
									about={{
										thing: "application",
										of: "events",
										application: {
											name: "payments",
											key: "a41f9c3e-7b2d-4e6a-8c15-3d9e0b7f2a64",
										},
										amount: 2140,
										share: 0.1834,
									}}
								/>
							</Panel>
						</State>
						<State
							label="Pointing at an application on the queues bar"
							recommendation="Approve, as for the events bar."
						>
							<Panel>
								<SegmentCard
									paragraphs={false}
									about={{
										thing: "application",
										of: "messages",
										application: {
											name: "payments",
											key: "a41f9c3e-7b2d-4e6a-8c15-3d9e0b7f2a64",
										},
										amount: 31,
										share: 0.124,
									}}
								/>
							</Panel>
						</State>
					</Part>
				</Tile>

				<Tile
					code="SC"
					title="Site view: the applications tile's chart"
					note="The chart along the bottom of the applications tile."
				>
					<Part
						step={1}
						title="The applications tile's chart"
						deciding="How the applications tile's heartbeat chart gives each application sending a signal a share, which heartbeats an application's share follows, and what happens to it when the signal stops."
						notDeciding="How the heartbeat chart draws a heartbeat, which is the cluster tile's (CL 5), including how a node's section falls to its deadline; the tile's words (SH 1) and its explainer (SW 3)."
						note="Each application sending a signal has an equal share of the chart's width. Before, an application's share follows the heartbeats of whichever of its nodes sent the latest one, and falls over three of that node's usual intervals. After, it follows the application's deadline, which is the latest of its nodes' deadlines, because the application is sending a signal while any of its nodes is: a heartbeat raises it only if it moves that deadline later, and it falls to empty at the deadline, which is when the application stops sending a signal. Its share then shrinks away. Each application here has the fixture's number of nodes, from one to six, which beat every two to five seconds, with a deadline 15 seconds after each heartbeat. Stop an application to see it go."
					>
						<State
							label="Applications sending a signal, before and after"
							recommendation="Approve the after. A share is empty exactly when its application stops sending a signal, and no one node's pace stands for the application's."
							wide
						>
							<ApplicationBeats applications={siteApplications.slice(0, 12)} />
						</State>
					</Part>
				</Tile>

				<Tile
					code="SW"
					title="Site view: the explainers"
					note="The words of the explainer of each of the site view's tiles: its annotations, its title and the text under the card. How an explainer looks and works is settled, by the cluster view's explainers; only these words are new, because they speak of all the applications at the site together. Point at a tile and press its &quot;?&quot; to read them."
				>
					<Part
						step={1}
						title="The events tile"
						deciding="The words of the events tile's explainer: its five annotations, its title, and the paragraph about event streams under the card."
						notDeciding="How an explainer looks and works, which is settled; the words on the tile itself, which are SH 1; the alert flag of a status, which is FL."
						note="It is the cluster view's events card for all the applications at the site together. Its bar is of the applications, and has no advice, because applications record events at whatever rate their work needs."
					>
						<State
							label="The events tile"
							recommendation="Approve. It has the cluster view's annotations, said of the applications together, and the paragraph about event streams; it has no box, because the applications run different engines. The bar's annotation says how fast each application records new events compared with the others, because the widths of the segments say only that, and the bar has no scale."
							wide
						>
							<Explained spec={siteEventsExplainer} />
						</State>
						<Choices
							of="A"
							title="the bar's annotation"
							framed={false}
							choices={siteEventsBar.slice(1).map(([label, text]) => [
								label,
								<p
									key={label}
									className="w-fit max-w-md rounded-card bg-panel px-4 py-3 font-hand text-[15px] leading-[16px] tracking-[-0.03em] text-fg-soft [box-shadow:var(--shadow-raised)]"
								>
									{text}
								</p>,
							])}
						/>
					</Part>
					<Part
						step={2}
						title="The queues tile"
						deciding="The words of the queues tile's explainer: its six annotations, its title, and the two paragraphs under the card."
						notDeciding="How an explainer looks and works, which is settled; the words on the tile itself (SH 1); counting the messages that are due, which is in the plan, and whose words the explainer already has."
						note="It is the cluster view's queues card for all the applications at the site together. Its bar is of the applications, and has no advice, for the same reason as the events tile's."
					>
						<State
							label="The queues tile"
							recommendation="Approve. It has the cluster view's annotations and paragraphs, said of the applications together, with no box. The bar's annotation compares the applications' ready messages, as the events tile's compares how fast they record new events."
							wide
						>
							<Explained spec={siteQueuesExplainer} />
						</State>
						<Choices
							of="A"
							title="the bar's annotation"
							framed={false}
							choices={siteQueuesBar.slice(1).map(([label, text]) => [
								label,
								<p
									key={label}
									className="w-fit max-w-md rounded-card bg-panel px-4 py-3 font-hand text-[15px] leading-[16px] tracking-[-0.03em] text-fg-soft [box-shadow:var(--shadow-raised)]"
								>
									{text}
								</p>,
							])}
						/>
					</Part>
					<Part
						step={3}
						title="The applications tile"
						deciding="The words of the applications tile's explainer: its three annotations, its title, and the paragraph about the heartbeat chart under the card."
						notDeciding="How an explainer looks and works, which is settled; the words on the tile itself (SH 1); the chart itself (SC 1)."
						note="Its headline is the applications sending a signal, with those that send none set apart in red, and its chart is the heartbeat chart, with a share for each application sending a signal."
					>
						<State
							label="The applications tile, while two applications are with no signal"
							recommendation="Approve. It explains the heartbeat chart as the cluster view's explainer does, with an application's share in place of a node's."
							wide
						>
							<Explained spec={siteApplicationsExplainer} />
						</State>
					</Part>
				</Tile>

				<Tile
					code="FL"
					title="Statuses as alert flags"
					note="Explainers take over explaining from the hovercards, so the statuses that those hovercards carry need a place of their own. A flag is an icon beside a card's label that is shown only while something is true of what the card is about. A status would be an alert flag, whose tooltip says the status."
				>
					<Part
						step={1}
						title="An alert flag while a status applies"
						deciding="That a status is shown as an alert flag while it applies; where the flag goes on each kind of card; and its color, grey for a status that qualifies the figures and red for one that says something is wrong."
						notDeciding="The words of each status, which are settled; that a flag opens a tooltip of its status, which is IC; the compact digest's alert flag, which it already has and whose tooltip is SH 2."
						note="On a vital card or a handler digest, the flag goes to the left of the card's icon, at the right of its top row, which is where a compact digest, which has no icon, has its flag. It is grey for a status that qualifies the figures, and red for one that says something is wrong, matching the red of the card. Point at a flag for its status."
					>
						{flaggedCards.map((f) => (
							<State
								key={f.label}
								label={f.label}
								note={f.note}
								recommendation={f.recommendation}
							>
								<Flagged {...f} />
							</State>
						))}
					</Part>
				</Tile>

				<Tile
					code="SH"
					title="Site view: the headlines' words"
					note="What each tile's headline and detail line say, and then what the tooltip of a compact digest's alert flag says."
				>
					<Part
						step={1}
						title="The headlines and detail lines"
						deciding="The words on the tiles themselves: each headline and detail line, such as &quot;messages in 7 queues, 2.1K/min&quot;."
						notDeciding="The tiles' explainers (SW); the tooltip of a compact digest's alert flag (SH 2); the bars (SB); the charts (SC); the look of the tiles in each state, which is settled (SS)."
						note="The words on the tiles themselves. The events tile's headline is the events per minute, and its detail line gives the events in the event streams of all the applications together, and how many streams there are. The queues tile's is the messages waiting, with those that are failing set apart in orange, as on the cluster view, and its detail line gives the number of queues of all the applications together and the messages handled per minute. The applications tile's is the number of applications sending a signal, with the number that send none set apart in red, and its detail line is the word &quot;applications&quot;."
					>
						<State
							label="Two applications with no signal, three with failing messages"
							recommendation="Approve, with these words. The events and queues tiles' detail lines have the shape of the cluster view's, quoted below, and the applications tile's is its noun alone, because its headline says the rest."
							precedents={[
								{
									where: "On the cluster view, the detail lines",
									status: "settled",
									words: (
										<>
											<p>events per minute, 844 events in 1 stream</p>
											<p>messages in 2 queues, 370/min</p>
										</>
									),
								},
							]}
							wide
						>
							<SiteDemo data={siteOf(someOut, euWest)} only="totals" />
						</State>
					</Part>

					<Part
						step={2}
						title="The tooltip of a compact digest's alert flag"
						deciding="The words of the tooltip of a compact digest's alert flag, which say what it means that there is no signal."
						notDeciding={
							"That an alert flag opens a tooltip, which is IC; the words on the tiles themselves (SH 1); the explainers of the tiles (SW); the alert flags of the other cards (FL); the hovercards of the bars' segments (SB)."
						}
						note="The tooltip of the alert flag of a compact digest whose application has no signal. The hovercards that explained the headlines are replaced by the tiles' explainers (SW)."
					>
						<State
							label="The tooltip of a compact digest's alert icon"
							note="It says what it means for the reader that there is no signal, in the words of the engine card's status, about the application."
							recommendation="Approve, with this wording, which was chosen with the other wordings about a signal. It is the engine card's status about the application, with &quot;it&quot; in place of saying &quot;the application&quot; twice in one sentence."
							precedents={[
								{
									where:
										"On the cluster view, the status of the engine card while there is no signal from the engine, for its words",
									status: { underReview: "FL 1" },
									words: <p>{engineOutText}</p>,
								},
							]}
						>
							<Tip>{noSignalText}</Tip>
						</State>
					</Part>
				</Tile>

				<Tile
					code="ID"
					title="Where the page is"
					note="The ID of the cluster that runs the application, or of the engine if it doesn't cluster, is the same for every part of the cluster view, so it belongs to the view, not to a card. It moves from the hovercard of the vital card's icon to the title bar, with the site and the application, and no card's icon opens a hovercard any more."
				>
					<Part
						step={2}
						title="Where the page is, in the title bar"
						deciding="That the title bar says where the page is as a trail, which moves to a row under the title bar once the views have links: the site, the application and the cluster, or the engine for an engine that doesn't cluster, each a link to its own page, by its name, the cluster's or engine's being the name of the engine's software while its nodes agree on it, and otherwise its shortened ID; that pointing at the trail shows a hovercard of each one's key or ID, shortened and copyable, and of the versions of the application and the engine's software, which, while the nodes give different versions, are the range of the engine's versions and &quot;multiple versions&quot; for the application's; and that no card's icon, on a vital card or a digest, opens a hovercard."
						notDeciding="How an ID is shortened and copied, which is settled; the IDs of the things in a card, which are in their segments' hovercards; what the site's and the application's own pages look like."
						note="Every page has its own address, so each step of the trail is a page to go to, and the trail reads in the order of the address: the site, then the application, then the cluster. The application and the site have names, so the trail shows their names and no keys. The cluster, or the engine that doesn't cluster, is named by the name of the engine's software, which its nodes give in their preambles, such as runkit, and the trail shows its shortened ID after it; if its nodes give different names, it has no name, and the trail shows the word cluster or engine before its shortened ID. In the hovercard, each step has the icon of its kind, as a card's heading has, a globe for the site, and each version is a tag at the right of the name, above the key or ID. The keys, for a person who needs to copy one, are in the hovercard of the trail. An application that runs at no site has &quot;no site&quot; as its first step. Point at the trail to see its hovercard. The links are an example of the navigation that an application's views will need, from the prototype's: its streams, queues, nodes and handlers. None of those pages is in v1, but the page has to leave room for them. An application has only the one view in v1, so the title bar has no links, and the trail is in it."
					>
						<State
							label="An engine that clusters"
							recommendation="Approve. The title bar says where the page is: every step of it is a link, and every key and ID can be copied from one place, without showing a key beside a name."
							wide
						>
							<TitleBar trail={<PageTrail steps={clusterSteps} />} />
						</State>
						<State
							label="An engine that doesn't cluster"
							recommendation="Approve, as for a cluster."
							wide
						>
							<TitleBar trail={<PageTrail steps={engineSteps} />} />
						</State>
						<State
							label="Nodes that give different engines"
							note="Some nodes give one name of the engine's software and some another, so the cluster has no name: the trail and the hovercard show its shortened ID in the name's place, and the hovercard's tag says &quot;multiple engines&quot;."
							recommendation="Approve. A name that the nodes disagree on isn't the cluster's name, so the cluster is shown as a thing with no name."
							wide
						>
							<TitleBar trail={<PageTrail steps={mixedEngineSteps} />} />
						</State>
						<State
							label="Nodes that run different versions"
							note="Part of the way through a deploy, some nodes run one version of the application or the engine and some another. The engine's versions are semantic versions, so its tag is the range from the lowest to the highest; the application's versions can be in any form, so its tag says &quot;multiple versions&quot;. Point at the trail to see it."
							recommendation="Approve. The reader sees that the versions differ, and for the engine by how much, without a status that guesses why."
							wide
						>
							<TitleBar trail={<PageTrail steps={mixedSteps} />} />
						</State>
						<State
							label="Once the views have links"
							wide
							note="The links, here the prototype's as an example, take the title bar, and the trail moves to a row of its own under it, because in one row with the trail they fit a wide window only just. The trail keeps its place on the left, and nothing else moves."
							recommendation="Approve. The links have the room that they need, and the trail stays where it was."
						>
							<TwoRows trail={<PageTrail steps={clusterSteps} />} />
						</State>
						<Choices
							of="A"
							title="where the page is"
							framed={false}
							choices={[
								[
									"A pin for the site, in the hovercard",
									<TitleBar
										key="pin"
										trail={
											<PageTrail
												steps={[
													{ ...(clusterSteps[0] as TrailStep), icon: "pin" },
													...clusterSteps.slice(1),
												]}
											/>
										}
									/>,
								],
								[
									"The trail in the title bar, and the links under it",
									<TwoRows
										key="trail-first"
										trailFirst
										trail={<PageTrail steps={clusterSteps} />}
									/>,
								],
								[
									"One row: the trail and the links",
									<TitleBar
										key="one-row"
										nav={exampleNav}
										trail={<PageTrail steps={clusterSteps} />}
									/>,
								],
								[
									"As before: the name, the site and the ID",
									<TitleBar
										key="before"
										nav={exampleNav}
										application={atSite}
										identifier={
											<>
												cluster{" "}
												<Identifier
													id="5f1e2a7c-8d3b-4c6e-9a0f-2b7d4e1c3a58"
													what="cluster ID"
												/>
											</>
										}
									/>,
								],
							]}
						/>
					</Part>
				</Tile>

				<Tile
					code="EV"
					title="Events tile"
					note="Under review: the hovercard of a segment of the bar, which drills down to one stream. The rest of the tile is settled, including the tile of an engine that appends every event to one stream, and the tile while only some nodes report what it shows."
				>
					<Part
						step={0}
						title="The tile"
						deciding="How the events tile looks in each of its states."
						notDeciding="What the hovercards say: the status, which becomes an alert flag (FL), and the hovercard of a segment of the bar (EV 4)."
					>
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
						step={4}
						title="The bar"
						deciding="What a segment of the events tile's bar shows when it is pointed at: its stream, its events and its share of them."
						notDeciding="Which streams the bar shows, and how it is drawn, which are settled; where the hovercard puts the stream's ID, which is IC; the words about the bar, which are in the explainer."
						decided={false}
						recommendation="Approve. It drills down to the stream: its events and its share of them."
						note="Each segment is an event stream, and has the hovercard of that stream: its ID, its events and its share of them. What the bar shows, and how it is best spread, are in the tile's explainer. An engine that appends every event to one stream has no bar, so the hovercard is only ever of one of several streams."
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
										paragraphs={false}
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
					note="Under review: the hovercard of a segment of the bar, as on the events tile. The rest of the tile is settled, including the tile of an engine that keeps every message in one queue."
				>
					<Part step={0} title="The tile" decided>
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
						deciding="What a segment of the queues tile's bar shows when it is pointed at: its queue, its messages and its share of them."
						notDeciding="Which queues the bar shows, and how it is drawn, which are settled; where the hovercard puts the queue's ID, which is IC; the words about the bar, which are in the explainer."
						decided={false}
						recommendation="Approve, as the events tile's bar."
						note="Each segment is a queue, and has the hovercard of that queue: its ID, its messages and its share of them. What the bar shows, and how it is best spread, are in the tile's explainer. An engine that keeps every message in one queue has no bar, so the hovercard is only ever of one of several queues."
					>
						{(
							[
								["A queue with a share", 12, 0.6, { amount: 20, things: 3 }],
							] as const
						).map(([label, amount, share, total]) => (
							<State key={label} label={`Pointing at ${label.toLowerCase()}`}>
								<Panel>
									<SegmentCard
										paragraphs={false}
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
					note="The tile of an engine that clusters, in each of its states, then the hovercards of its bar's segments, and its chart. The explainer, which is approved, says what the rest of the tile shows."
				>
					<Part
						step={0}
						title="The tile"
						deciding="How the cluster tile looks while a node doesn't report its workloads."
						notDeciding="The statuses, which become alert flags (FL); the explainer, which is approved; the chart (CL 5)."
					>
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
							note="Other nodes report their workloads and this one doesn't, so this one is supported and not working, and its hovercard says only that its workloads are unknown: its share isn't known, and its segment is a faint square. The number of workloads counts only the nodes that report them, blurred by how few they are."
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
						step={4}
						title="The bar"
						deciding="What a segment of the cluster tile's bar shows when it is pointed at: its node, its workloads and its share of them; and what it says about a node that doesn't report its workloads."
						notDeciding="How the bar is drawn, which is settled; where the hovercard puts the node's ID, which is IC; the words about the bar, which are in the explainer (CL 6)."
						decided={false}
						note="Each segment is a node, and has the hovercard of that node. The hovercard drills down: its figures are the node's workloads and its share of them. A node that owns none has no share. What the bar shows, and that workloads vary in size, are in the tile's explainer."
					>
						{(
							[
								["A node that owns some", 3, 0.6],
								["A node that owns none", 0, 0],
							] as const
						).map(([label, amount, share]) => (
							<State
								key={label}
								label={`Pointing at ${label.toLowerCase()}`}
								decided={false}
								recommendation={
									amount === 0
										? "Approve, as for a node that owns some, with no share."
										: "Approve. It drills down to the node: its workloads and its share of them."
								}
							>
								<Panel>
									<SegmentCard
										paragraphs={false}
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
							note="Other nodes report their workloads and this one doesn't, so its hovercard has a status. One or several nodes can be in this state at once."
							decided={false}
							recommendation="Approve, with this wording. It is supported and not working, so it keeps its place in the bar, as a faint square, and its hovercard says why, as a status, without a negation."
						>
							<Panel>
								<SegmentCard
									paragraphs={false}
									about={{ thing: "node", id: nodeId, unreported: true }}
								/>
							</Panel>
						</State>
						<Choices
							of="B"
							title="the status"
							choices={[
								[
									"The consequence first",
									<NodeCardWith
										key="first"
										status="This node's workloads are unknown. Other nodes in the cluster report their workloads."
									/>,
								],
								[
									"As a contrast",
									<NodeCardWith
										key="contrast"
										status="Some of the cluster's nodes report their workloads and this node doesn't report its workloads."
									/>,
								],
							]}
						/>
					</Part>

					<Part
						step={5}
						title="The chart"
						deciding="How a node's section of the chart falls between its heartbeats: to empty at the deadline that its latest heartbeat gives, which is when the Observatory takes it to be with no signal."
						notDeciding="The rest of how the chart moves, which is settled: the static and the lens with no node live, the ripple when the first comes back, and the line settling when the last goes."
						note="The heartbeat of each live node. With none live, the grey line breaks into static now and then, and a lens scans along it. When the first node comes back the lens finds it, after static and a short search if it wasn't scanning, and the heartbeat grows out of that place as a ripple. When the last node goes, the heartbeat settles back to the flat line. Today a node's section falls to empty over three of the usual intervals between its heartbeats, as the browser has seen them. With deadlines, it falls to empty at the deadline of its latest heartbeat: the time by which the node says that it sends the next, or, if it says none, three of the intervals that its engine gives. The nodes here beat every two to five seconds, with a deadline 15 seconds after each heartbeat, as the demo engine's do. Add nodes, and stop them, to see each."
					>
						<State
							label="Nodes coming and going, before and after"
							recommendation="Approve the after. A section is empty exactly when there is no signal from its node, so the chart never shows a node as gone while it is sending a signal, or as there after it has gone."
							wide
						>
							<Nodes application={application} />
						</State>
					</Part>

					<Part
						step={6}
						title="The explainer's sentence about workloads"
						deciding="That the explainer says that workloads vary in size, at the end of its paragraph about workloads, which is there only when the engine reports workloads; and the sentence's words."
						notDeciding="The rest of the explainer, which is approved; the hovercards of the bar's segments (CL 4)."
						note="The sentence was a paragraph of each node's hovercard. It tells the reader not to read a node's count of workloads as how busy the node is, and its words never change, so it explains, which is the explainer's job. Point at the tile and press its &quot;?&quot; to read it."
					>
						<State
							label="The explainer"
							recommendation="Approve, with this wording, which the node's hovercard had. Nothing in the spec says how big a workload is."
							wide
						>
							<Explained spec={clusterExplainer(workloadsVary[0][1])} />
						</State>
						<Choices
							of="A"
							title="the sentence"
							framed={false}
							choices={workloadsVary.slice(1).map(([label, sentence]) => [
								label,
								<p
									key={label}
									className="max-w-md rounded-card bg-panel p-4 text-fg-soft [box-shadow:var(--shadow-raised)]"
								>
									{workloadsParagraph} {sentence}
								</p>,
							])}
						/>
					</Part>
				</Tile>

				<Tile
					code="EN"
					title="Engine tile"
					note="The tile of an engine that doesn't cluster, in place of the cluster tile, in each of its states, and then its parts, from the least specific to the most. It has no detail line and no bar."
				>
					<Part step={0} title="The tile" decided>
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
						step={3}
						title="The chart"
						decided={true}
						note="The heartbeat of the engine, which behaves as the cluster tile's does for one node."
					/>
					<Part
						step={4}
						title="The explainer"
						deciding="The words of the engine tile's explainer: its two annotations, its title, and the paragraph about heartbeats under the card."
						notDeciding="The alert flag of the engine while there is no signal from it, which is FL; how an explainer looks and opens, which is settled."
						note="It takes the place of the hovercards of the icon and the headline, by the rules of the cluster view's explainers. What &quot;online&quot; means, which the headline's hovercard said, is in its text."
					>
						<State
							label="Online"
							recommendation="Approve. It explains the heartbeat chart as the cluster card's explainer does, for one process, and says what the card shows when the heartbeats stop, which gives &quot;online&quot; its meaning."
							wide
						>
							<Explained spec={engineExplainer} />
						</State>
					</Part>
				</Tile>
			</Review>
		</ExplainersBuilt>
	);
}

/**
 * Flagged draws a card with an alert flag to the left of its icon. Pointing at the
 * flag shows the status in a tooltip. It shows how a status would look once the
 * hovercards that explain stop carrying statuses. A vital card draws the flag in
 * its top row, between its chart's readout and its icon; for another card, the
 * flag is placed to the left of `anchor`.
 */
function Flagged({
	card,
	width,
	anchor,
	tone,
	status,
}: {
	card: ReactNode;
	width: number;

	/** A CSS selector for what the flag goes to the left of, on a card that isn't a vital card. */
	anchor?: string;

	/** "bad" for red, "qualifies" for the grey of a status that qualifies. */
	tone: "bad" | "qualifies";

	/** The words of the status, which the flag's tooltip says. */
	status: ReactNode;
}) {
	const ref = useRef<HTMLDivElement>(null);
	const [at, setAt] = useState<{ x: number; y: number }>();
	useLayoutEffect(() => {
		const el = ref.current;
		const target = anchor === undefined ? null : el?.querySelector(anchor);
		if (!el || !target) {
			return;
		}
		const box = el.getBoundingClientRect();
		const r = target.getBoundingClientRect();
		setAt({
			x: r.left - box.left - 22,
			y: r.top + r.height / 2 - box.top - 8,
		});
	}, [anchor]);
	const flag = (
		<Popover content={status}>
			<span
				className={cn(
					"flex size-4 flex-none",
					tone === "bad" ? "text-bad" : "text-fg-soft",
				)}
			>
				<Icon name="alert" className="size-4" />
				<span className="sr-only">Status</span>
			</span>
		</Popover>
	);
	return (
		<div ref={ref} className="relative" style={{ width }}>
			{anchor === undefined ? <TileFlag value={flag}>{card}</TileFlag> : card}
			{at && (
				<span className="absolute z-20" style={{ left: at.x, top: at.y }}>
					{flag}
				</span>
			)}
		</div>
	);
}

/** The cards of FL 1, each with the status that it would flag. */
const flaggedCards = [
	{
		label: "The events tile, while only some nodes report it",
		note: "Today the status is in the hovercard of the tile's icon.",
		recommendation:
			"Approve. The status shows only while it applies, in grey, because the figures are still worth reading.",
		width: 360,
		tone: "qualifies" as const,
		card: (
			<EventsTile
				application={application}
				data={{ ...overview.events, coverage: 0.67 }}
				href={undefined}
			/>
		),
		status: partialStatus.text,
	},
	{
		label: "The queues tile, while no new samples are arriving",
		note: "Today the status is in the hovercard of the rate.",
		recommendation: "Approve, as for the events tile.",
		width: 360,
		tone: "qualifies" as const,
		card: (
			<QueuesTile
				application={application}
				data={overview.queues}
				href={undefined}
			/>
		),
		status: "No new samples are arriving, so this average is out of date.",
	},
	{
		label: "The cluster tile, while no nodes are sending a signal",
		note: "Today the status is in the hovercard of the nodes.",
		recommendation:
			"Approve, in red, because something is wrong, as the tile's red 0 and accent already say.",
		width: 360,
		tone: "bad" as const,
		card: (
			<ClusterTile
				application={application}
				data={{ ...overview.cluster, nodes: [] }}
				href={undefined}
			/>
		),
		status: noNodesText,
	},
	{
		label: "A handler digest, while only some nodes report it",
		note: "Today the status is in the hovercard of the kind icon. The flag goes to the left of the kind icon, where a compact digest has its flag, and clear of the chevron that follows the name when it is pointed at.",
		recommendation: "Approve, as for the events tile.",
		width: 360,
		anchor: "svg.size-5",
		tone: "qualifies" as const,
		card: (
			<HandlerDigest
				application={application}
				handler={{
					...(overview.handlers[0] as OverviewData["handlers"][number]),
					coverage: 0.5,
				}}
				href="#"
			/>
		),
		status: partialStatus.text,
	},
];

/**
 * An example of the navigation of an application's views, from the prototype's,
 * to show how much room the title bar leaves for it. None of these pages is in
 * v1.
 */
const exampleNav: NavItem[][] = [
	[{ label: "Overview", icon: "cluster", href: "#", current: true }],
	[
		{ label: "Event streams", icon: "event-stream", href: "#" },
		{ label: "Queues", icon: "queue", href: "#" },
		{ label: "Nodes", icon: "node", href: "#" },
		{ label: "Handlers", icon: "aggregate", href: "#" },
	],
];

/**
 * TwoRows is the title bar with the view's links, and a row under it that says
 * where the page is, as ID 2 proposes, or, with `trailFirst`, the other way
 * around. It is a mockup, and becomes part of the page if it is accepted.
 */
function TwoRows({
	trail,
	trailFirst = false,
	links = exampleNav,
}: {
	trail: ReactNode;
	trailFirst?: boolean;

	/** The view's links, which are none in v1. */
	links?: NavItem[][];
}) {
	const row = (content: ReactNode, label: string) => (
		<div className="border-b border-line bg-[color-mix(in_srgb,var(--color-panel)_86%,transparent)]">
			<nav
				aria-label={label}
				className="mx-auto flex h-11 max-w-page items-center gap-0.5 overflow-x-auto px-6 [scrollbar-width:none] max-narrow:px-4"
			>
				{content}
			</nav>
		</div>
	);
	const groups = links.map((group, g) => (
		// biome-ignore lint/suspicious/noArrayIndexKey: a group has no identity but its position
		<NavGroup key={g} items={group} divided={g > 0} />
	));

	return trailFirst ? (
		<div>
			<TitleBar trail={trail} />
			{row(groups, "Views")}
		</div>
	) : (
		<div>
			<TitleBar nav={links} />
			<div className="border-b border-line bg-[color-mix(in_srgb,var(--color-panel)_86%,transparent)]">
				<div className="mx-auto flex h-10 max-w-page items-center px-6 max-narrow:px-4">
					{trail}
				</div>
			</div>
		</div>
	);
}

/** The key of the site of the review page's examples. */
const siteKey = "3a7d9c21-0b4e-4f6a-8d15-6c2e9f0b7a43";

/** A step of a page's trail, for ID 2. */
interface TrailStep {
	kind: string;

	/** The icon of the step's kind, as a card's heading has. */
	icon: IconName;

	name?: string;
	href: string;
	id: { id: string; what: string };

	/** True if the trail shows the step's shortened ID after its name, as a cluster's or an engine's. */
	idInTrail?: boolean;

	/**
	 * The versions of the step, if it has any, as tags after its name: the
	 * application's version, or "multiple versions" while the nodes give
	 * different ones; or the version of the engine's software, as the range from
	 * the lowest to the highest by semantic versioning while the nodes give
	 * different ones, or "multiple engines" while they give different engines. A version that some nodes give
	 * and others don't says on how many nodes it runs.
	 */
	versions?: string[];
}

/**
 * PageTrail is where a page is, in the title bar, as LK's and ID's proposal: a
 * trail of steps, the site, the application and the cluster or the engine, each
 * a link to its own page, by its name. The cluster, or the engine that doesn't
 * cluster, is named by the name of the engine's software, which its nodes give.
 * Pointing at the trail shows a hovercard of each step's key or ID, which can be
 * copied. It is a mockup for ID 2, and becomes part of the title bar if it is
 * accepted.
 */
function PageTrail({ steps }: { steps: TrailStep[] }) {
	return (
		<Popover
			card
			interactive
			content={
				// Each step is drawn as a card's heading is: its name, or its ID if it
				// has no name, over its kind; a step with a name has its key at the
				// right of its kind.
				<div className="flex min-w-64 flex-col divide-y divide-line">
					{steps.map((s) => (
						<div key={s.kind} className="flex gap-3 px-3.5 py-3">
							<Icon
								name={s.icon}
								className="mt-px size-5 flex-none text-cluster"
							/>
							<div className="flex min-w-0 flex-1 flex-col gap-1">
								{/* The name and the kind are on the left, and the version and
								the key or ID on the right, so that each lines up with the one
								of the other steps. A long name is cut short before its
								version. */}
								<span className="flex items-center justify-between gap-6">
									<span className="min-w-0 truncate font-bold tracking-[0.04em] text-fg uppercase">
										{s.name ?? <Identifier id={s.id.id} what={s.id.what} />}
									</span>
									{s.versions?.map((v) => (
										<span
											key={v}
											className="flex-none rounded-full bg-sunk px-2 py-0.5 text-2xs font-medium text-fg-soft tabular-nums"
										>
											{v}
										</span>
									))}
								</span>
								<span className="flex items-center justify-between gap-6">
									<span className="text-2xs font-semibold tracking-[0.08em] text-muted uppercase">
										{s.kind}
									</span>
									{s.name !== undefined && (
										<span className="text-xs text-fg-soft tabular-nums">
											<Identifier id={s.id.id} what={s.id.what} />
										</span>
									)}
								</span>
							</div>
						</div>
					))}
				</div>
			}
		>
			<nav
				aria-label="Where this page is"
				className="flex items-center gap-1.5 text-sm whitespace-nowrap text-muted"
			>
				{steps.map((s, i) => (
					<Fragment key={s.kind}>
						{i > 0 && (
							<Icon name="chevron" className="size-3 flex-none text-faint" />
						)}
						<a
							href={s.href}
							className={cn(
								"no-underline decoration-from-font underline-offset-2 hover:underline",
								i === steps.length - 1
									? "font-medium text-fg-soft"
									: "text-muted",
							)}
						>
							{s.name === undefined ? (
								<>
									{s.kind.toLowerCase()} {shortId(s.id.id)}
								</>
							) : s.idInTrail ? (
								<>
									{s.name} {shortId(s.id.id)}
								</>
							) : (
								s.name
							)}
						</a>
					</Fragment>
				))}
			</nav>
		</Popover>
	);
}

/**
 * PointedName is a compact digest's name as it looks while it is pointed at, in
 * one of the looks that LK chooses between, drawn as it stands, so that the looks
 * can be compared side by side.
 */
function PointedName({ look }: { look: "underline" | "chevron" | "accent" }) {
	return (
		<span
			className={cn(
				"block w-fit rounded-card bg-panel px-3.5 py-3 text-xs font-bold tracking-[0.04em] uppercase [box-shadow:var(--shadow-raised)]",
				look === "underline" &&
					"underline decoration-from-font underline-offset-2",
				look === "accent" && "text-accent",
			)}
		>
			payments
			{look !== "underline" && (
				<Icon name="chevron" className="ml-0.5 inline size-3 align-[-1px]" />
			)}
		</span>
	);
}

/**
 * Captioned shows a hovercard in the frame of a panel, with a caption above it that
 * says which hovercard it is.
 */
function Captioned({
	caption,
	children,
}: {
	caption: string;
	children: ReactNode;
}) {
	return (
		<div className="flex flex-col gap-2">
			<span className="text-xs text-muted">{caption}</span>
			<Panel>{children}</Panel>
		</div>
	);
}

/**
 * Captioned2 is a group of captioned hovercards, under a title that says where
 * they are.
 */
function Captioned2({
	title,
	children,
}: {
	title: string;
	children: ReactNode;
}) {
	return (
		<div className="flex flex-col gap-3">
			<span className="text-xs font-semibold text-fg-soft">{title}</span>
			<div className="flex flex-wrap items-start gap-6">{children}</div>
		</div>
	);
}

/** Tip is a tooltip, drawn where it stands. */
function Tip({ children }: { children: ReactNode }) {
	return (
		<div className={cn(panelClasses, "w-max max-w-xs px-2.5 py-1.5")}>
			{children}
		</div>
	);
}

/** The application of the cluster view's fixture, at a site. */
const atSite = { ...application, site: "eu-west" };

/**
 * The name of the engine's software in the review page's examples, which a node
 * gives in its preamble. It names the cluster, or the engine that doesn't
 * cluster, in the trail.
 */
const engineName = "runkit";

/** The steps of the trail of a page about a cluster, for ID 2. */
const clusterSteps: TrailStep[] = [
	{
		kind: "Site",
		icon: "globe",
		name: "eu-west",
		href: "#",
		id: { id: siteKey, what: "site key" },
	},
	{
		kind: "Application",
		icon: "application",
		name: atSite.name,
		href: "#",
		id: { id: atSite.key, what: "application key" },
		versions: ["2026.11.3"],
	},
	{
		kind: "Cluster",
		icon: "cluster",
		name: engineName,
		idInTrail: true,
		href: "#",
		id: { id: "5f1e2a7c-8d3b-4c6e-9a0f-2b7d4e1c3a58", what: "cluster ID" },
		versions: ["0.3.1"],
	},
];

/** The steps of the trail of a page about an engine that doesn't cluster, for ID 2. */
const engineSteps: TrailStep[] = [
	...clusterSteps.slice(0, 2),
	{
		kind: "Engine",
		icon: "engine",
		name: engineName,
		idInTrail: true,
		href: "#",
		id: { id: "2c9e4b17-6a3d-4f08-b5e1-9d7a0c3f6e24", what: "engine ID" },
		versions: ["0.3.1"],
	},
];

/**
 * The steps of the trail of a page about a cluster whose nodes give different
 * names of the engine's software, so that the cluster has no name, for ID 2.
 */
const mixedEngineSteps: TrailStep[] = [
	clusterSteps[0] as TrailStep,
	clusterSteps[1] as TrailStep,
	{
		kind: "Cluster",
		icon: "cluster",
		href: "#",
		id: { id: "5f1e2a7c-8d3b-4c6e-9a0f-2b7d4e1c3a58", what: "cluster ID" },
		versions: ["multiple engines"],
	},
];

/**
 * The steps of the trail of a page about a cluster whose nodes run different
 * versions, part of the way through a deploy, for ID 2.
 */
const mixedSteps: TrailStep[] = [
	clusterSteps[0] as TrailStep,
	{
		...(clusterSteps[1] as TrailStep),
		versions: ["multiple versions"],
	},
	{
		...(clusterSteps[2] as TrailStep),
		versions: ["0.3.1–0.4.0"],
	},
];

/**
 * The applications of the site view, all sending a signal, with no failing messages,
 * for judging its layout on its own.
 */
const calm = siteApplications.map((a) =>
	a.queues === undefined
		? a
		: {
				...a,
				queues: { messages: a.queues.messages - a.queues.failing, failing: 0 },
			},
);

/**
 * The applications of the site view with two with no signal, and two with only
 * some of their nodes sending a signal.
 */
const someOut = withSignal(siteApplications, {
	out: ["kyc", "payroll"],
	partly: { orders: 0.5, payments: 0.67 },
});

/**
 * SiteDemo is the site view, or only its applications tile, with heartbeats that
 * arrive from each application that is sending a signal, each at its own pace, as they
 * do on the view, so that its chart moves.
 */
function SiteDemo({
	data,
	only,
}: {
	data: SiteData;
	only?: "applications" | "totals";
}) {
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
			) : only === "totals" ? (
				<SiteTotals data={live} />
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

	/** When it next beats, on the browser's clock, or undefined once it has stopped. */
	next: number | undefined;

	/** The times of its latest heartbeats, oldest first, on the browser's clock. */
	beats: number[];
}

/** The most nodes that the demonstration adds. */
const demoNodes = 8;

/**
 * How long after a demonstration node's heartbeat arrives the heartbeat expires,
 * in milliseconds, which is the demo engine's: longer than the longest of the
 * nodes' intervals.
 */
const demoExpiry = 15_000;

/**
 * demoNode returns a node of a demonstration, which beats every two to five
 * seconds, as the demo engine's nodes do, and has just beaten.
 */
function demoNode(id: string, now: number): DemoNode {
	const interval = 2000 + Math.random() * 3000;
	return {
		id,
		workloads: 1 + Math.floor(Math.random() * 3),
		interval,
		next: now + interval,
		beats: [now],
	};
}

/**
 * beat makes each node that is due beat, and takes away each node that has
 * stopped once its latest heartbeat has expired, as the Observatory takes it to
 * be with no signal then. It returns true if anything changed.
 */
function beat(nodes: DemoNode[], now: number): boolean {
	let changed = false;

	for (const n of nodes) {
		if (n.next !== undefined && now >= n.next) {
			changed = true;
			n.beats = [...n.beats, now].slice(-9);
			n.next = now + n.interval * (0.9 + Math.random() * 0.2);
		}
	}

	const live = nodes.filter(
		(n) => n.next !== undefined || now < (n.beats.at(-1) ?? 0) + demoExpiry,
	);
	if (live.length !== nodes.length) {
		nodes.splice(0, nodes.length, ...live);
		changed = true;
	}

	return changed;
}

/**
 * SideBySide shows two things side by side, each with a caption above it,
 * such as a chart before and after a change.
 */
function SideBySide({
	items,
}: {
	items: readonly (readonly [string, ReactNode])[];
}) {
	return (
		<div className="flex flex-wrap items-start gap-8">
			{items.map(([caption, item]) => (
				<div key={caption} className="flex w-[360px] flex-col gap-2">
					<span className="text-sm font-semibold">{caption}</span>
					{item}
				</div>
			))}
		</div>
	);
}

/**
 * Nodes is a cluster tile that has no node, to which nodes can be added, and
 * whose nodes can be stopped, as nodes join and leave a cluster, drawn twice
 * from the same heartbeats, once with no deadlines, so that each node's level
 * drains over three of its usual intervals, and once with the deadline of each
 * node's latest heartbeat, to which its level drains. Each node beats at its own pace while it runs, and each beat is
 * data that arrives, as it does on the cluster's page. A node that is stopped
 * doesn't send any more heartbeats, and leaves when its latest one expires.
 */
function Nodes({ application }: { application: Application }) {
	const nodes = useRef<DemoNode[]>([]);
	const added = useRef(0);
	const [receivedAt, setReceivedAt] = useState(() => performance.now());

	useEffect(() => {
		const timer = window.setInterval(() => {
			const now = performance.now();
			if (beat(nodes.current, now)) {
				setReceivedAt(now);
			}
		}, 50);

		return () => window.clearInterval(timer);
	}, []);

	const running = nodes.current.filter((n) => n.next !== undefined);

	const add = () => {
		if (nodes.current.length >= demoNodes) {
			return;
		}

		const now = performance.now();
		added.current++;
		// Ascending, because the page lists nodes by ID.
		const id = `00000000-0000-4000-8000-${String(added.current).padStart(12, "0")}`;
		nodes.current = [...nodes.current, demoNode(id, now)];
		setReceivedAt(now);
	};

	const stop = (all: boolean) => {
		for (const n of all ? running : running.slice(-1)) {
			n.next = undefined;
		}
		setReceivedAt(performance.now());
	};

	const tile = (deadlines: boolean) => (
		<ClusterTile
			application={application}
			data={{
				reportsWorkloads: true,
				nodes: nodes.current.map((n) => ({
					id: n.id,
					workloads: n.workloads,
					heartbeats: n.beats.map((t) => receivedAt - t),
					deadline: deadlines
						? (n.beats.at(-1) ?? receivedAt) + demoExpiry - receivedAt
						: undefined,
				})),
			}}
			href={undefined}
		/>
	);

	return (
		<div className="flex flex-col gap-3">
			<LiveData receivedAt={receivedAt}>
				<SideBySide
					items={[
						["Before: over three of the usual intervals", tile(false)],
						["After: to the deadline", tile(true)],
					]}
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
					disabled={running.length === 0}
					onClick={() => stop(false)}
				>
					Stop a node
				</button>
				<button
					type="button"
					className={button}
					disabled={running.length === 0}
					onClick={() => stop(true)}
				>
					Stop them all
				</button>
			</div>
		</div>
	);
}

/**
 * ApplicationBeats is the applications tile of a site's applications, drawn
 * twice from the same heartbeats: once with each application's section
 * following the node that sent the latest heartbeat, with no deadline, and once
 * with the latest deadline of the application's nodes, to which its section
 * drains. Each
 * application has as many nodes as the fixture gives it, and each node beats at
 * its own pace. An application can be stopped, which stops each of its nodes; it
 * has no signal once the last of their heartbeats has expired.
 */
function ApplicationBeats({
	applications,
}: {
	applications: SiteApplication[];
}) {
	const nodes = useRef<Map<string, DemoNode[]> | undefined>(undefined);
	if (nodes.current === undefined) {
		const now = performance.now();
		nodes.current = new Map(
			applications.map((a) => [
				a.application.key,
				Array.from({ length: a.nodes }, (_, i) => {
					const n = demoNode(String(i), now);
					// The nodes start at different moments, as real ones do.
					n.beats = [now - Math.random() * n.interval];
					return n;
				}),
			]),
		);
	}
	const [receivedAt, setReceivedAt] = useState(() => performance.now());

	useEffect(() => {
		const timer = window.setInterval(() => {
			const now = performance.now();
			let changed = false;
			for (const ns of nodes.current?.values() ?? []) {
				changed = beat(ns, now) || changed;
			}
			if (changed) {
				setReceivedAt(now);
			}
		}, 50);

		return () => window.clearInterval(timer);
	}, []);

	const all = [...(nodes.current?.entries() ?? [])];
	const running = all.filter(([, ns]) => ns.some((n) => n.next !== undefined));
	const stopped = all.filter(([, ns]) => ns.every((n) => n.next === undefined));

	const stop = () => {
		for (const n of running[0]?.[1] ?? []) {
			n.next = undefined;
		}
		setReceivedAt(performance.now());
	};

	const start = () => {
		const now = performance.now();
		for (const [key, ns] of stopped) {
			const a = applications.find((x) => x.application.key === key);
			ns.splice(
				0,
				ns.length,
				...Array.from({ length: a?.nodes ?? 1 }, (_, i) =>
					demoNode(String(i), now),
				),
			);
		}
		setReceivedAt(now);
	};

	const tile = (deadlines: boolean) => (
		<ApplicationsTile
			data={siteOf(
				applications.map((a) => {
					const ns = nodes.current?.get(a.application.key) ?? [];
					if (ns.length === 0) {
						return { ...a, nodes: 0, heartbeats: [] };
					}
					return {
						...a,
						...(deadlines
							? deadlineBeats(ns, receivedAt)
							: { heartbeats: latestNodeBeats(ns, receivedAt) }),
					};
				}),
				euWest,
			)}
		/>
	);

	return (
		<div className="flex flex-col gap-3">
			<LiveData receivedAt={receivedAt}>
				<SideBySide
					items={[
						["Before: the node that sent the latest heartbeat", tile(false)],
						["After: the latest deadline of its nodes", tile(true)],
					]}
				/>
			</LiveData>
			<div className="flex flex-wrap gap-2">
				<button
					type="button"
					className={button}
					disabled={running.length === 0}
					onClick={stop}
				>
					Stop an application
				</button>
				<button
					type="button"
					className={button}
					disabled={stopped.length === 0}
					onClick={start}
				>
					Start them again
				</button>
			</div>
		</div>
	);
}

/**
 * latestNodeBeats returns the times of the heartbeats of the node that sent the
 * latest one, in milliseconds before `now`.
 */
function latestNodeBeats(nodes: DemoNode[], now: number): number[] {
	let latest: DemoNode | undefined;
	for (const n of nodes) {
		if ((n.beats.at(-1) ?? -1) > (latest?.beats.at(-1) ?? -1)) {
			latest = n;
		}
	}
	return (latest?.beats ?? []).map((t) => now - t);
}

/**
 * deadlineBeats returns the heartbeats of an application's nodes that each moved
 * its deadline later, and its deadline, which is the latest of its nodes', as the
 * applications tile takes them, in milliseconds before and after `now`.
 */
function deadlineBeats(
	nodes: DemoNode[],
	now: number,
): { heartbeats: number[]; deadline: number } {
	const times = nodes.flatMap((n) => n.beats).sort((a, b) => a - b);
	const moved: number[] = [];
	let deadline = Number.NEGATIVE_INFINITY;
	for (const t of times) {
		if (t + demoExpiry > deadline) {
			deadline = t + demoExpiry;
			moved.push(t);
		}
	}
	return {
		heartbeats: moved.slice(-9).map((t) => now - t),
		deadline: deadline - now,
	};
}

/** The data of the cluster tile, with the given number of the fixture's nodes. */
function clusterTile(nodes: number): NonNullable<OverviewData["cluster"]> {
	return {
		...overview.cluster,
		nodes: overview.cluster.nodes.slice(0, nodes),
	};
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

/** The ID of the node that the hovercards of a node on this page are of. */
const nodeId = "113cbdc3-5b2d-4e8a-a1c6-0d4b8e2f7a93";

/**
 * NodeCardWith is the hovercard of a node on the cluster tile's bar, with other words
 * than its own, for a choice of wording: `paragraphs` for one that owns three of
 * five workloads, or `status` for one that doesn't report its workloads.
 */
function NodeCardWith({ status }: { status: string }) {
	return (
		<InfoCard
			subsystem="cluster"
			icon="node"
			kind="Node"
			id={{ id: nodeId, what: "node ID" }}
			status={{ icon: "alert", text: status }}
		/>
	);
}

/**
 * The cluster explainer's paragraph about workloads, without the sentence that
 * says that workloads vary in size.
 */
const workloadsParagraph =
	"The work is divided into ongoing tasks, such as delivering messages to a handler, which are called workloads. Each workload is given to one node at a time.";

/**
 * The wordings of the sentence that says that workloads vary in size, which CL 6
 * chooses between, the recommended one first.
 */
const workloadsVary = [
	[
		"Two nodes, with different amounts of work",
		"Workloads vary in size, so two nodes with the same number of workloads can have very different amounts of work to do.",
	],
	[
		"One node busier than another",
		"Workloads vary in size, so one node can be busier than another node with the same number of workloads.",
	],
	[
		"Two nodes, as busy as each other or not",
		"Workloads vary in size, so two nodes with the same number of workloads can be very different in how busy they are.",
	],
	[
		"Counts and work",
		"Some workloads take more work than others, so equal counts can mean unequal work.",
	],
	[
		"Not always busier",
		"Workloads vary in size, so a node with more workloads isn't always busier.",
	],
	[
		"Naming the resources",
		"Workloads vary in size, so nodes with the same number of workloads can use very different amounts of CPU and memory.",
	],
] as const;

/**
 * The data of the cluster tile in its explainer, whose last node has just sent a
 * heartbeat, so that the chart is high at its right end, where its arrow ends.
 */
const explainedCluster = {
	...overview.cluster,
	nodes: overview.cluster.nodes.map((node, i, nodes) => ({
		...node,
		heartbeats: nodes[nodes.length - 1 - i]?.heartbeats ?? node.heartbeats,
	})),
};

/**
 * clusterExplainer is the approved explainer of the cluster tile, with the given
 * sentence about the size of workloads at the end of its paragraph about them.
 */
function clusterExplainer(sentence: string): ExplainerSpec {
	return {
		label: "cluster vital card",
		icon: "svg.size-5",
		title: (
			<>
				The nodes of the cluster that runs the{" "}
				<ApplicationName application={atSite} />
			</>
		),
		width: 360,
		card: (
			<ClusterTile
				application={application}
				data={explainedCluster}
				href={undefined}
			/>
		),
		notes: [
			{
				at: ".text-4xl",
				text: "the number of nodes sending a signal now",
				side: "left",
				atText: true,
				with: [{ at: ":scope > article > span", atText: "cluster nodes" }],
				approach: "top-left",
				dy: -40,
			},
			{
				at: ":scope > article > span",
				text: "the number of workloads in the cluster",
				side: "top",
				atText: "5 workloads",
			},
			{
				at: "div.h-2",
				text: "how the workloads are spread across the nodes",
				side: "left",
				dy: 6,
			},
			{
				at: "canvas",
				text: "how recently each node sent a heartbeat",
				side: "right",
				into: "chart",
			},
		],
		paragraphs: [
			"Each node is a running process of the application's engine, and the nodes share the application's work.",
			{ text: `${workloadsParagraph} ${sentence}`, when: { has: "workload" } },
			"Each node sends heartbeats to show that it is running. Its section of the heartbeat chart rises with each heartbeat and falls until the next, so it sinks to the bottom if the heartbeats stop.",
		],
	};
}

/**
 * The site of the explainers of the site view's tiles: six applications sending
 * a signal, two of which have failing messages.
 */
const explainedSite = siteOf(
	siteApplications
		.filter((a) => (a.queues?.failing ?? 0) > 0)
		.slice(0, 2)
		.concat(
			siteApplications
				.filter((a) => (a.queues?.failing ?? 0) === 0)
				.slice(0, 4),
		),
	euWest,
);

/**
 * The site of the applications tile's explainer, with two applications that send
 * no signal.
 */
const explainedOut = siteOf(
	someOut.map((a, i, all) =>
		// Most of the applications have just sent a heartbeat, which keeps their
		// share of the chart full, and some haven't for a while, so that the
		// chart dips here and there and is high at its right end, where its arrow
		// ends.
		[6, 21, 22, 47, 63].includes(i) && i < all.length - 10
			? a
			: { ...a, heartbeats: [1000] },
	),
	euWest,
);

/** The title of a site tile's explainer: what it is about, at the eu-west site. */
function siteTitle(what: string) {
	return (
		<>
			{what} at the <span className="font-semibold text-fg">eu-west</span> site
		</>
	);
}

/**
 * The wordings of the annotation of the bar of the site's events tile, which SW
 * 1A chooses between, the recommended one first. The bar divides the rate of new
 * events among the applications, as the headline is that rate.
 */
const siteEventsBar = [
	[
		"Compared with the others",
		"how fast each application is recording new events, compared with the others",
	],
	[
		"As before: how fast each one is",
		"how fast each application is recording new events",
	],
	[
		"Where they come from",
		"which applications the new events are coming from, and how fast",
	],
	[
		"How much of the rate",
		"how much of the rate of new events comes from each application",
	],
	["The fastest applications", "which applications record new events fastest"],
] as const;

/**
 * The wordings of the annotation of the bar of the site's queues tile, which SW
 * 2A chooses between, the recommended one first. The bar divides the ready
 * messages among the applications, as the headline is their number.
 */
const siteQueuesBar = [
	[
		"Compared with the others",
		"how many ready messages each application has, compared with the others",
	],
	[
		"As before: spread across the applications",
		"how the ready messages are spread across the applications",
	],
] as const;

const siteEventsExplainer: ExplainerSpec = {
	label: "site's events tile",
	icon: "svg.size-5",
	title: siteTitle("The events and event streams of the applications"),
	width: 360,
	card: explainedSite.events && (
		<SiteEventsTile data={explainedSite} events={explainedSite.events} />
	),
	notes: [
		{
			at: ".text-4xl",
			text: "the rate of new events across the applications, averaged over the last minute",
			compare: "the rate of new events, averaged over the last minute",
			side: "left",
			atText: true,
			with: [{ at: ":scope > article > span", atText: "events per minute" }],
			approach: "top-left",
			dy: -40,
		},
		{
			at: ":scope > article > span",
			text: "total number of events on the applications' event streams",
			compare: "total number of events on the application's event streams",
			side: "top",
			atText: `${formatCompact(explainedSite.events?.streams?.events ?? 0)} events`,
		},
		{
			at: ":scope > article > span",
			text: "the number of event streams the applications have",
			compare: "the number of event streams the application has",
			side: "right",
			atText: `${formatCompact(explainedSite.events?.streams?.count ?? 0)} streams`,
			bow: "under",
		},
		{
			at: "div.h-2",
			text: siteEventsBar[0][1],
			compare: "how the events are spread across the streams",
			side: "left",
			dy: 6,
		},
		{
			at: "svg.h-12",
			text: "events recorded over the last minute",
			compare: "the same",
			side: "right",
			into: "chart",
		},
		{
			at: "[data-moon]",
			text: "the moon",
			side: "right",
			compare: "the same",
		},
	],
	paragraphs: [
		{
			text: "Events that an application records are written to event streams. Streams store events in the order they are written, so they can be read in that order.",
			when: { has: "stream" },
			compare:
				"the same, with “the application”, and then a box: The statements application's engine spreads events across several event streams. An even spread is better; a stream that holds more than its fair share limits parallel throughput. Each aggregate instance is bound to a single stream so that its events can be read in order.",
		},
	],
};

const siteQueuesExplainer: ExplainerSpec = {
	label: "site's queues tile",
	icon: "svg.size-5",
	title: siteTitle("The messages and queues of the applications"),
	width: 360,
	card: explainedSite.queues && (
		<SiteQueuesTile data={explainedSite} queues={explainedSite.queues} />
	),
	notes: [
		{
			at: ".text-4xl",
			text: "the number of messages ready to be delivered now, across the applications",
			compare: "the number of messages ready to be delivered now",
			side: "left",
			atText: formatCompact(
				(explainedSite.queues?.messages ?? 0) -
					(explainedSite.queues?.failing ?? 0),
			),
			with: [
				{ at: ":scope > article > span", atText: "messages" },
				{ at: ".text-4xl .text-failing", atText: true, keepInk: true },
			],
			approach: "top-left",
			dy: -40,
		},
		{
			at: ".text-4xl .text-failing",
			text: "the number of messages that are failing",
			compare: "the same",
			side: "top",
			wordsLeft: true,
			atText: true,
			keepInk: true,
		},
		{
			at: ":scope > article > span",
			text: "the number of queues the applications have",
			compare: "the number of queues the application has",
			side: "top",
			atText: `${formatCompact(explainedSite.queues?.queues ?? 0)} queues`,
		},
		{
			at: ":scope > article > span",
			text: "the rate of handled messages across the applications, averaged over the last minute",
			compare: "the rate of handled messages, averaged over the last minute",
			side: "right",
			atText: "/min",
			dy: -4,
		},
		{
			at: "div.h-2",
			text: siteQueuesBar[0][1],
			compare: "how the ready messages are spread across the queues",
			side: "left",
			dy: 6,
		},
		{
			at: "svg.h-12",
			text: "messages handled over the last minute",
			compare: "the same",
			side: "right",
			into: "chart",
		},
		{
			at: "[data-moon]",
			text: "the moon",
			side: "right",
			compare: "the same",
		},
	],
	paragraphs: [
		{
			text: "Commands and deadlines wait on queues until they are delivered. A command is ready to be delivered as soon as it is queued, and a deadline once its scheduled time arrives.",
			compare: "the same",
		},
		{
			text: "Fewer ready messages is better. If the number keeps rising, messages are becoming ready faster than they are being handled.",
			compare:
				"the same, and then a box: The statements application's engine spreads messages across several queues. An even spread is better; a queue that holds more than its fair share limits parallel throughput.",
		},
	],
};

const siteApplicationsExplainer: ExplainerSpec = {
	label: "site's applications tile",
	icon: "svg.size-5",
	title: siteTitle("The applications"),
	width: 360,
	card: <ApplicationsTile data={explainedOut} />,
	notes: [
		{
			at: ".text-4xl",
			text: "the number of applications sending a signal now",
			compare: "the number of nodes sending a signal now",
			side: "left",
			atText: String(
				explainedOut.applications.filter((a) => a.nodes > 0).length,
			),
			with: [
				{ at: ":scope > article > span", atText: "applications" },
				{ at: ".text-4xl .text-bad", atText: true, keepInk: true },
			],
			approach: "top-left",
			dy: -40,
		},
		{
			at: ".text-4xl .text-bad",
			text: "the number of applications with no signal",
			compare: "nothing yet: the red count of nodes with no signal isn't built",
			side: "top",
			atText: true,
			keepInk: true,
		},
		{
			at: "canvas",
			text: "how recently each application sent a heartbeat",
			compare: "how recently each node sent a heartbeat",
			side: "right",
			into: "chart",
		},
	],
	paragraphs: [
		{
			text: "Each application's engine sends heartbeats to show that it is running. An application's section of the heartbeat chart rises with each heartbeat and falls until the next, so it sinks to the bottom if the heartbeats stop.",
			compare:
				"Each node sends heartbeats to show that it is running. Its section of the heartbeat chart rises with each heartbeat and falls until the next, so it sinks to the bottom if the heartbeats stop.",
		},
	],
};

const engineExplainer: ExplainerSpec = {
	label: "engine tile",
	icon: "svg.size-5",
	title: (
		<>
			The engine that runs the <ApplicationName application={atSite} />
		</>
	),
	width: 360,
	card: (
		<EngineTile
			application={application}
			data={{
				// It has just sent a heartbeat, so that its chart is full.
				node: {
					...(overview.cluster.nodes[0] as LiveNode),
					heartbeats: [1000],
				},
			}}
			href={undefined}
		/>
	),
	notes: [
		{
			at: ".text-4xl",
			text: "whether the engine is sending a signal now",
			compare: "the number of nodes sending a signal now",
			side: "left",
			atText: true,
			approach: "top-left",
			dy: -40,
		},
		{
			at: "canvas",
			text: "how recently the engine sent a heartbeat",
			compare: "how recently each node sent a heartbeat",
			side: "right",
			into: "chart",
		},
	],
	paragraphs: [
		{
			text: "The engine sends heartbeats to show that it is running. The heartbeat chart rises with each heartbeat and falls until the next. If the heartbeats stop, the chart sinks to the bottom, and the card shows the engine as offline.",
			compare:
				"Each node sends heartbeats to show that it is running. Its section of the heartbeat chart rises with each heartbeat and falls until the next, so it sinks to the bottom if the heartbeats stop.",
		},
	],
};
