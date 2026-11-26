import { type ReactNode, useEffect, useRef, useState } from "react";
import { application, overview } from "../fixtures/overview.ts";
import {
	euWest,
	siteApplications,
	siteOf,
	withSignal,
} from "../fixtures/site.ts";
import { cn } from "../lib/cn.ts";
import { Covered } from "../lib/distrust.tsx";
import { LiveData } from "../lib/live.tsx";
import type {
	OverviewData,
	SiteApplication,
	SiteData,
	Software,
} from "../model.ts";
import { Explained } from "./Explainer.tsx";
import {
	cardExplainers,
	engineExplainer,
	siteExplainers,
} from "./explainers.tsx";
import { HandlerDigest } from "./HandlerDigest.tsx";
import { Icon } from "./Icon.tsx";
import { Identifier } from "./Identifier.tsx";
import { InfoCard } from "./InfoCard.tsx";
import {
	ClusterTile,
	EngineTile,
	EventsTile,
	QueuesTile,
	Totals,
} from "./Overview.tsx";
import { PageTrail } from "./PageTrail.tsx";
import { panelClasses } from "./Popover.tsx";
import { Choices, Panel, Part, Review, State, Tile } from "./review.tsx";
import { SegmentCard } from "./SegmentCard.tsx";
import {
	ApplicationsTile,
	CompactDigests,
	noSignalText,
	SiteBreakdown,
	SiteEventsTile,
	SiteOverview,
	SiteTotals,
} from "./SiteView.tsx";
import { noSignalFromEngine } from "./statuses.ts";
import { TitleBar } from "./TitleBar.tsx";

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
				note="How the view looks as its applications' messages fail and as their signal stops: the accents, the blur and the words that take the place of a compact digest's figures."
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
										about={{ thing: "node", id: nodeId, unreported: true }}
									/>
								</Captioned>
							</Captioned2>
							<Captioned2 title="The site view's bars">
								<Captioned caption="An application, on the events bar">
									<SegmentCard
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
						note="Today each segment of a handler digest's bar has a tooltip of one line, with the ID inside the sentence: &quot;100 instances bound to event stream 8b0081fd ⧉&quot; on an aggregate's bar, &quot;20 instances bound to deadline queue c42e7a19 ⧉&quot; on a process's, and &quot;120 commands/min on node 113cbdc3 ⧉&quot; on an integration's or a projection's. These follow the rule instead, as cards with the ID in the place of a name, the kind, and the figure. They have no paragraphs, as the digest's explainer says what the bar is."
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
					note="Each application sending a signal has an equal share of the chart's width. An application's share follows the application's deadline, which is the latest of its nodes' deadlines, because the application is sending a signal while any of its nodes is: a heartbeat raises it only if it moves that deadline later, and it falls to empty at the deadline, which is when the application stops sending a signal. Its share then shrinks away. Each application here has the fixture's number of nodes, from one to six, which beat every two to five seconds, with a deadline 15 seconds after each heartbeat. Stop an application to see it go."
				>
					<State
						label="Applications sending a signal"
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
						<Explained spec={reviewSite.events} />
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
						<Explained spec={reviewSite.queues} />
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
						<Explained spec={reviewSite.applications} />
					</State>
				</Part>
			</Tile>

			<Tile
				code="FL"
				title="Statuses as alert flags"
				note="Explainers took over explaining from the hovercards, so the statuses that those hovercards carried have a place of their own. A flag is an icon beside a card's label that is shown only while something is true of what the card is about. A status is an alert flag, whose tooltip says the status. These are the real cards, with their real flags."
			>
				<Part
					step={1}
					title="An alert flag while a status applies"
					deciding="That a status is shown as an alert flag while it applies; where the flag goes on each kind of card; and its color, grey for a status that qualifies the figures and red for one that says something is wrong."
					notDeciding="The words of each status, which are settled; that a flag opens a tooltip of its status, which is IC; the compact digest's alert flag, which it already has and whose tooltip is SH 2."
					note="On a vital card, the flag is in its top row, between the readout of its chart and its icon, so that the readout, which appears while the chart is pointed at, comes before the flag. On a handler digest, it is to the left of the kind icon, which is where a compact digest, which has no icon, has its flag. It is grey for a status that qualifies the figures, and red for one that says something is wrong, matching the red of the card. A card with two statuses at once has one flag, whose tooltip says both, red if either is. Point at a flag for its status."
				>
					<State
						label="The events tile, while only some nodes report it"
						recommendation="Approve. The status shows only while it applies, in grey, because the figures are still worth reading."
					>
						<FlaggedCard>
							<EventsTile
								data={{ ...overview.events, coverage: 0.67 }}
								href={undefined}
							/>
						</FlaggedCard>
					</State>
					<State
						label="The queues tile, while no new samples are arriving"
						note="The rate is lost a moment after the card is drawn, and is kept as the last rate that there was. After a minute without samples, the flag says that there aren't enough samples yet."
						recommendation="Approve, as for the events tile."
					>
						<FlaggedCard>
							<LosingRate />
						</FlaggedCard>
					</State>
					<State
						label="The cluster tile, while no nodes are sending a signal"
						recommendation="Approve, in red, because something is wrong, as the tile's red 0 and accent already say."
					>
						<FlaggedCard>
							<ClusterTile
								data={{ ...overview.cluster, nodes: [] }}
								href={undefined}
							/>
						</FlaggedCard>
					</State>
					<State
						label="A handler digest, while only some nodes report it"
						note="The flag goes to the left of the kind icon, where a compact digest has its flag, and clear of the chevron that follows the name when it is pointed at."
						recommendation="Approve, as for the events tile."
					>
						<FlaggedCard>
							<HandlerDigest
								handler={{
									...(overview.handlers[0] as OverviewData["handlers"][number]),
									coverage: 0.5,
								}}
								href="#"
							/>
						</FlaggedCard>
					</State>
					<State
						label="The cluster tile, while only some nodes report their workloads"
						note="Built by the rule of FL 1A, for the status of the number of workloads."
						decided
					>
						<FlaggedCard>
							<ClusterTile
								data={{
									...overview.cluster,
									nodes: overview.cluster.nodes.map((n, i) =>
										i === 1 ? { id: n.id, heartbeats: n.heartbeats } : n,
									),
								}}
								href={undefined}
							/>
						</FlaggedCard>
					</State>
					<State
						label="The engine tile, while there is no signal from the engine"
						note="Built by the rule of FL 1C, in red, as the tile's red &quot;Offline&quot; and accent already say."
						decided
					>
						<FlaggedCard>
							<EngineTile data={{}} href={undefined} />
						</FlaggedCard>
					</State>
					<State
						label="The site's events tile, while only some applications report it"
						note="Built by the rule of FL 1A."
						decided
					>
						<FlaggedCard>
							<SiteEventsTile
								data={flaggedSite}
								events={{
									...(flaggedSite.events as NonNullable<SiteData["events"]>),
									coverage: 0.8,
								}}
							/>
						</FlaggedCard>
					</State>
					<State
						label="The site's applications tile, while no applications are sending a signal"
						note="Built by the rule of FL 1C."
						decided
					>
						<FlaggedCard>
							<ApplicationsTile data={silentSite} />
						</FlaggedCard>
					</State>
					<State
						label="Compact digests, while a rate isn't known yet"
						note="A compact digest's flag says whether its rate of events can be given, as the events tile's does, and, with no signal, only that: the first has a rate, the second's rate isn't known yet, and the third has no signal. Its hovercard said this before the explainers were built."
						recommendation="Approve. Every status that the hovercards held has a place, and a compact digest's flag works as a tile's does."
						wide
					>
						<div className="max-w-xl">
							<CompactDigests
								data={siteOf(
									[
										siteApplications[0] as SiteApplication,
										{
											...(siteApplications[1] as SiteApplication),
											events: { perMinute: undefined },
										},
										{
											...(siteApplications[2] as SiteApplication),
											nodes: 0,
										},
									],
									euWest,
								)}
								alert="icon"
							/>
						</div>
					</State>
					<State
						label="The events tile, with two statuses at once"
						note="Only some nodes report it, and its rate isn't known yet: one flag, whose tooltip says both."
						decided
					>
						<FlaggedCard>
							<EventsTile
								data={{
									...overview.events,
									coverage: 0.67,
									rate: { perMinute: undefined },
								}}
								href={undefined}
							/>
						</FlaggedCard>
					</State>
					<State
						label="A flag coming and going"
						note="A flag fades in with a short glitch when a status begins to apply, so that the eye goes to it, and fades out when the last one stops, as a card's bar or chart does. It doesn't move when the page first draws, nor for a viewer who asks for less motion. Press the button to make only some nodes report the tile, and again to make them all report it."
						recommendation="Approve. The flag is noticed at the moment that something changes, by the effect that already says that something needs attention, and the card doesn't jump."
						wide
					>
						<FlagComingAndGoing />
					</State>
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
					note="The words on the tiles themselves. The events tile's headline is the events per minute, and its detail line gives the events on the event streams of all the applications together, and how many streams there are. The queues tile's is the messages waiting, with those that are failing set apart in orange, as on the cluster view, and its detail line gives the number of queues of all the applications together and the messages handled per minute. The applications tile's is the number of applications sending a signal, with the number that send none set apart in red, and its detail line is the word &quot;applications&quot;."
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
										<p>events per minute, 844 events on 1 stream</p>
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
								words: <p>{noSignalFromEngine.text}</p>,
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
					deciding="That the title bar says where the page is as a trail: the page's address, the site and the application, and, on a cluster's own page, the cluster, or the engine for an engine that doesn't cluster, each a link to its own page, by its name, the cluster's or engine's being the name of the engine's software while its nodes agree on it, and otherwise its shortened ID; that pointing at the trail shows a hovercard of each one's key or ID, shortened and copyable, and of the versions of the application and the engine's software, which, while the nodes give different versions, are the range of the engine's versions and &quot;multiple versions&quot; for the application's; and that no card's icon, on a vital card or a digest, opens a hovercard."
					notDeciding="Where the trail goes once the views have links, which waits until they do; how an ID is shortened and copied, which is settled; the IDs of the things in a card, which are in their segments' hovercards; what the site's and the application's own pages look like."
					note="Every page has its own address, so each step of the trail is a page to go to, and the trail is the page's address: on an application's page, the site and then the application, which is what a reader asks to see; on a cluster's own page, the cluster after them. The cluster that runs the application, which a deploy can replace, is in the hovercard on an application's page. The application and the site have names, so the trail shows their names and no keys. The cluster, or the engine that doesn't cluster, is named by the name of the engine's software, which its nodes give in their preambles, such as runkit, and the trail shows its shortened ID after it; if its nodes give different names, it has no name, and the trail shows the word cluster or engine before its shortened ID. In the hovercard, each step has the icon of its kind, as a card's heading has a pin for the site, and each version is a tag at the right of the name, above the key or ID. The keys, for a person who needs to copy one, are in the hovercard of the trail. An application that runs at no site has no site step: its trail starts with the application, and its hovercard has no site. Point at the trail to see its hovercard. An application has only the one view in v1, so the title bar has no links, and the trail is in it. Where the trail goes once the views have links is left until they do."
				>
					<State
						label="An application's page, whose engine clusters"
						recommendation="Approve. The trail says what the reader asked to see, the application at its site; every step of it is a link, and every key and ID, and the cluster that runs the application, are in its hovercard, without a key beside a name."
						wide
					>
						<TitleBar trail={<Trail software={sameSoftware} />} />
					</State>
					<State
						label="An application's page, whose engine doesn't cluster"
						recommendation="Approve, as for a cluster."
						wide
					>
						<TitleBar trail={<Trail software={sameSoftware} engine />} />
					</State>
					<State
						label="A cluster's own page"
						note="The page that a person reaches by choosing one of several clusters that run the application, or by the cluster's link. Its address is the cluster's, so the trail ends with the cluster, by the name of its engine's software and its shortened ID."
						recommendation="Approve. The trail is the page's address, so it names the cluster only on the cluster's own page."
						wide
					>
						<TitleBar trail={<Trail software={sameSoftware} onClusterPage />} />
					</State>
					<State
						label="Nodes that give different engines"
						note="Some nodes give one name of the engine's software and some another, so the cluster has no name: the trail and the hovercard show its shortened ID in the name's place, and the hovercard gives no engine or version for it."
						recommendation="Approve. A name that the nodes disagree on isn't the cluster's name, so the cluster is shown as a thing with no name."
						wide
					>
						<TitleBar
							trail={<Trail software={{ applicationVersion: "2026.11.3" }} />}
						/>
					</State>
					<State
						label="Nodes that run different versions"
						note="Part of the way through a deploy, some nodes run one version of the application or the engine and some another. The engine's versions are semantic versions, so its tag is the range from the lowest to the highest; the application's versions can be in any form, so its tag says &quot;multiple versions&quot;. Point at the trail to see it."
						recommendation="Approve. The reader sees that the versions differ, and for the engine by how much, without a status that guesses why."
						wide
					>
						<TitleBar
							trail={
								<Trail
									software={{
										engineName: "runkit",
										engineVersions: { lowest: "0.3.1", highest: "0.4.0" },
										applicationVersionsDiffer: true,
									}}
								/>
							}
						/>
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
									trail={<Trail software={sameSoftware} />}
								/>,
							],
							[
								"As before: the name, the site and the ID",
								<TitleBar
									key="before"
									trail={
										<span className="flex items-center gap-3 whitespace-nowrap">
											<span className="font-medium text-muted">
												{atSite.name}
												<span className="font-normal"> at {atSite.site}</span>
											</span>
											<span className="text-xs text-faint">
												cluster{" "}
												<Identifier
													id="5f1e2a7c-8d3b-4c6e-9a0f-2b7d4e1c3a58"
													what="cluster ID"
												/>
											</span>
										</span>
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
						<EventsTile data={overview.events} href={undefined} />
					</State>
					<State
						label="An engine that appends every event to one stream"
						note="The engine says so, so the one stream is the only one there is. The tile doesn't count streams, and has no bar, because there is no spread to show."
						decided
					>
						<EventsTile
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
							<ClusterTile data={clusterTile(nodes)} href={undefined} />
						</State>
					))}
					<State
						label="An engine that doesn't divide its work"
						note="The tile leaves the workloads out, and has no bar, because a bar of nodes alone would only say how many there are, which the headline says."
						decided
					>
						<ClusterTile
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
						note="Other nodes report their workloads and this one doesn't, so this one is supported and not working: its share isn't known, so its segment is a faint square, and the number of workloads counts only the nodes that report them, blurred by how few they are. What its segment's hovercard says is CL 4C."
						decided={false}
						recommendation="Approve. The cluster supports what any of its nodes supports, and a node that doesn't is supported and not working, which it stops being when every node supports the same things."
					>
						<ClusterTile
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
								about={{ thing: "node", id: nodeId, unreported: true }}
							/>
						</Panel>
					</State>
					<Choices
						of="C"
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
					note="The heartbeat of each live node. With none live, the grey line breaks into static now and then, and a lens scans along it. When the first node comes back the lens finds it, after static and a short search if it wasn't scanning, and the heartbeat grows out of that place as a ripple. When the last node goes, the heartbeat settles back to the flat line. A node's section falls to empty at the deadline of its latest heartbeat: the time by which the node says that it sends the next, or, if it says none, three of the intervals that its engine gives. A node whose heartbeats give neither stays full while it is connected. The nodes here beat every two to five seconds, with a deadline 15 seconds after each heartbeat, as the demo engine's do. A stopped node's section glitches once its next heartbeat is late, and the tile names a node while its share is pointed at. Add nodes, and stop them, to see each."
				>
					<State
						label="Nodes coming and going"
						recommendation="Approve the after. A section is empty exactly when there is no signal from its node, so the chart never shows a node as gone while it is sending a signal, or as there after it has gone."
						wide
					>
						<Nodes />
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
						<Explained spec={cardExplainers(atSite).cluster} />
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
							data={{ node: overview.cluster.nodes[0] }}
							href={undefined}
						/>
					</State>
					<State
						label="Offline"
						note="The headline is red, and so is the accent along the top."
						decided
					>
						<EngineTile data={{}} href={undefined} />
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
						<Explained spec={engineExplainer(atSite)} />
					</State>
				</Part>
			</Tile>
		</Review>
	);
}

/**
 * FlaggedCard draws one of FL's cards at the width of a card in a row of three.
 */
function FlaggedCard({ children }: { children: ReactNode }) {
	return <div style={{ width: 360 }}>{children}</div>;
}

/**
 * LosingRate is the queues tile whose rate is lost a moment after it is drawn,
 * so that it shows the flag of a rate whose samples have stopped arriving.
 */
function LosingRate() {
	const [throughput, setThroughput] = useState(overview.queues.throughput);
	useEffect(() => {
		const timer = window.setTimeout(
			() => setThroughput((t) => t && { ...t, perMinute: undefined }),
			50,
		);
		return () => window.clearTimeout(timer);
	}, []);
	return (
		<QueuesTile data={{ ...overview.queues, throughput }} href={undefined} />
	);
}

/** The site of FL's site tiles: twelve applications, all sending a signal. */
const flaggedSite = siteOf(siteApplications.slice(0, 12), euWest);

/** A site whose applications are all without a signal, for FL. */
const silentSite = siteOf(
	withSignal(siteApplications.slice(0, 12), {
		out: siteApplications.slice(0, 12).map((a) => a.application.name),
	}),
	euWest,
);

/** The key of the site of the review page's examples. */
const siteKey = "3a7d9c21-0b4e-4f6a-8d15-6c2e9f0b7a43";

/**
 * FlagComingAndGoing is an events tile with a button that makes only some of its
 * nodes report it, and then all of them again, so that its flag comes and goes.
 */
function FlagComingAndGoing() {
	const [partial, setPartial] = useState(false);
	return (
		<div className="flex flex-col gap-3">
			<FlaggedCard>
				<EventsTile
					data={{
						...overview.events,
						coverage: partial ? 0.67 : undefined,
					}}
					href={undefined}
				/>
			</FlaggedCard>
			<div>
				<button
					type="button"
					className={button}
					onClick={() => setPartial(!partial)}
				>
					{partial
						? "Make every node report it"
						: "Make only some nodes report it"}
				</button>
			</div>
		</div>
	);
}

/**
 * Trail is the trail of the review page's examples, for ID 2: the statements
 * application at the eu-west site, run by a cluster, or by an engine that
 * doesn't cluster, whose nodes give the given software.
 */
function Trail({
	software,
	engine = false,
	onClusterPage = false,
}: {
	software: Software;
	engine?: boolean;
	onClusterPage?: boolean;
}) {
	return (
		<PageTrail
			site={{ name: "eu-west", key: siteKey }}
			application={application}
			runner={
				engine
					? { kind: "engine", id: "2c9e4b17-6a3d-4f08-b5e1-9d7a0c3f6e24" }
					: { kind: "cluster", id: "5f1e2a7c-8d3b-4c6e-9a0f-2b7d4e1c3a58" }
			}
			software={software}
			onClusterPage={onClusterPage}
		/>
	);
}

/** The software of the review page's examples, which every node agrees on. */
const sameSoftware: Software = {
	engineName: "runkit",
	engineVersions: { lowest: "0.3.1", highest: "0.3.1" },
	applicationVersion: "2026.11.3",
};

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
		applications: data.applications.map((a) => {
			const b = beats.current.get(a.application.key);
			const last = b?.beats.at(-1);
			if (a.nodes === 0 || b === undefined || last === undefined) {
				return { ...a, heartbeats: [] };
			}
			// Each heartbeat expires after three of the application's intervals, as
			// the Observatory takes one that gives no expiry of its own to.
			return {
				...a,
				heartbeats: b.beats.map((t) => receivedAt - t),
				deadline: last + 3 * b.interval - receivedAt,
			};
		}),
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
		// A heartbeat arrives when it is due, though the page only finds it at its
		// next tick, so that a running node is never late.
		if (n.next !== undefined && now >= n.next) {
			changed = true;
			n.beats = [...n.beats, n.next].slice(-9);
			n.next += n.interval;
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
 * Nodes is a cluster tile that has no node, to which nodes can be added, and
 * whose nodes can be stopped, as nodes join and leave a cluster. Each node's
 * section drains to the deadline of its latest heartbeat. Each node beats at its
 * own pace while it runs, and each beat is
 * data that arrives, as it does on the cluster's page. A node that is stopped
 * doesn't send any more heartbeats, and leaves when its latest one expires.
 */
function Nodes() {
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

	const tile = (
		<ClusterTile
			data={{
				reportsWorkloads: true,
				nodes: nodes.current.map((n) => ({
					id: n.id,
					workloads: n.workloads,
					heartbeats: n.beats.map((t) => receivedAt - t),
					deadline: (n.beats.at(-1) ?? receivedAt) + demoExpiry - receivedAt,
					interval: n.interval,
				})),
			}}
			href={undefined}
		/>
	);

	return (
		<div className="flex flex-col gap-3">
			<LiveData receivedAt={receivedAt}>
				<div className="w-[360px]">{tile}</div>
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
 * ApplicationBeats is the applications tile of a site's applications, whose
 * sections drain to the latest deadline of each application's nodes. Each
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

	const tile = (
		<ApplicationsTile
			data={siteOf(
				applications.map((a) => {
					const ns = nodes.current?.get(a.application.key) ?? [];
					if (ns.length === 0) {
						return { ...a, nodes: 0, heartbeats: [] };
					}
					return { ...a, ...deadlineBeats(ns, receivedAt) };
				}),
				euWest,
			)}
		/>
	);

	return (
		<div className="flex flex-col gap-3">
			<LiveData receivedAt={receivedAt}>
				<div className="w-[360px]">{tile}</div>
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
				<EventsTile data={overview.events} href={undefined} />
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

/** The explainers of the site view's tiles, at the site of the review's examples. */
const reviewSite = siteExplainers("eu-west");
