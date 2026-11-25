import {
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
	withContact,
} from "../fixtures/site.ts";
import { cn } from "../lib/cn.ts";
import { Covered } from "../lib/distrust.tsx";
import { formatCompact, formatPercent } from "../lib/format.ts";
import { LiveData } from "../lib/live.tsx";
import type {
	Application,
	LiveNode,
	OverviewData,
	SiteData,
} from "../model.ts";
import { ApplicationName } from "./ApplicationName.tsx";
import { noNodesText } from "./ClusterCards.tsx";
import { engineOutText } from "./EngineCard.tsx";
import { Explained, type ExplainerSpec } from "./Explainer.tsx";
import { HandlerDigest } from "./HandlerDigest.tsx";
import {
	HandlerKindCard,
	handlerKindAbout,
	handlerKindReminders,
} from "./HandlerKindCard.tsx";
import { Icon } from "./Icon.tsx";
import { Identifier } from "./Identifier.tsx";
import { InfoCard } from "./InfoCard.tsx";
import { messagesWaitingText } from "./MessagesWaitingCard.tsx";
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
import { Popover } from "./Popover.tsx";
import { partialStatus } from "./partial.ts";
import { Ramped } from "./Ramped.tsx";
import { Choices, Panel, Part, Review, State, Tile } from "./review.tsx";
import { SegmentCard, things } from "./SegmentCard.tsx";
import {
	ApplicationsTile,
	CompactDigests,
	ContactLostCard,
	SiteBreakdown,
	SiteEventsTile,
	SiteOverview,
	SiteQueuesTile,
	SiteTotals,
	siteEventRateWords,
	siteHandlingWords,
} from "./SiteView.tsx";
import { handlerSubsystem, kindColors } from "./subsystems.ts";

/**
 * ReviewPage shows every state of the tiles that are being worked on, or that
 * have something undecided, side by side, so that a person reviewing a tile sees
 * all of them and not only the one that the data happens to be in. The tiles are
 * in the order in which their decisions depend on each other: what is open about
 * a layout first, then about states, then about words. Each tile is
 * shown whole, and then part by part, in the order of review, from the least
 * specific to the most: its icon, its headline, its detail line, its
 * bar and its chart. A hovercard whose words never change, and that has a status in
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
					notDeciding={
						"What the tiles and the compact digests say, the made-up figures, the bars and the charts, which come in later chunks; how the view looks when messages fail or contact is lost (SS); whether the grid is of compact digests or of squares (SL 1)."
					}
					recommendation="Approve the layout. The tiles answer how busy the site is and whether anything is wrong, and the grid below answers where, with every application one click from its view."
					note="The three tiles are the events per minute, the messages waiting and the applications in contact. The applications are in the order of their names, so that an application keeps its place."
				>
					<State label="Every application in contact" wide>
						<SiteDemo data={siteOf(calm, euWest)} />
					</State>
				</Part>

				<Part
					step={1}
					title="The grid of applications"
					notDeciding={
						"What a compact digest's figures are, and what their hovercards say (SH); how a compact digest looks when its application's messages fail or contact with it is lost (SS); the order of the applications (SL 0)."
					}
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
				note="How the view looks as its applications' messages fail and as contact with them is lost: the accents, the blur and the words that take the place of a compact digest's figures. The words of the tiles' hovercards come in the next chunk."
			>
				<Part
					step={0}
					title="The view in each state"
					notDeciding={
						"The layout (SL); what the tiles and their hovercards say, including the hovercard that explains the applications tile's headline (SW and SH); the bars (SB); the applications tile's chart (SC). All of them are shown, but none of them is decided here."
					}
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
						label="Two applications out of contact, and two with only some nodes in contact"
						note="The two out of contact, kyc and payroll, have the red accent and a red alert icon at the right of their names, as tiles and handler digests have their icon there, and pointing at the icon shows a hovercard that says the application is out of contact, whose words are reviewed in SH 2. Their figures keep their places as blurry zeros, which glitch when contact is lost. The blur says how far a figure is trusted, and the red says that contact is lost. The figures of the two partly in contact, orders and payments, are blurred by the coverage rule, and so, slightly, are the totals. The applications tile's headline is the applications in contact, with those out of contact set apart in red, as in &quot;94 +2&quot;, as the queues tile sets apart failing messages in orange, and the tile has the red accent while any application is out of contact, because an application out of contact is one that nothing shows to be working, unlike a node, whose cluster's other nodes carry on."
						recommendation="Approve, with the icon. It takes no room from the name, so a long name isn't cut short, and its hovercard gives the words, as the status of a hovercard does elsewhere. The red accent and the icon mark an application out of contact as the cluster tile marks a cluster with no nodes, and the blur is the coverage rule's."
						wide
					>
						<SiteDemo data={siteOf(someOut, euWest)} />
					</State>
					<State
						label="Every application out of contact"
						note="The totals are the last ones, distrusted, as a cluster's are when every node is out of contact, and the applications tile's headline is a red 0 alone, with no &quot;+N&quot;, because when every application is out of contact there is nothing to set them apart from."
						recommendation="Approve, as the cluster view does it."
						wide
					>
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
						title="how a compact digest says that contact is lost"
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
				code="SW"
				title="Site view: the explainers"
				note="The explainer of each of the site view's tiles, which takes the place of the hovercards that explained them, by the rules of the cluster view's explainers. Point at a tile and press its &quot;?&quot;. The compact digest's explainer is approved on the cluster view's review of explainers."
			>
				<Part
					step={1}
					title="The events tile"
					notDeciding="The words on the tile, which are SH 1; the alert flag of a status, which is FL; how an explainer looks and opens, which is settled."
					note="It is the cluster view's events card for all the applications at the site together. Its bar is of the applications, and has no advice, because applications record events at whatever rate their work needs."
				>
					<State
						label="The events tile"
						recommendation="Approve. It has the cluster view's annotations, said of the applications together, and the paragraph about event streams; it has no box, because the applications run different engines."
						wide
					>
						<Explained spec={siteEventsExplainer} />
					</State>
				</Part>
				<Part
					step={2}
					title="The queues tile"
					notDeciding="The words on the tile, which are SH 1; counting the messages that are due, which is in the plan, and whose words the explainer already has."
					note="It is the cluster view's queues card for all the applications at the site together. Its bar is of the applications, and has no advice, for the same reason as the events tile's."
				>
					<State
						label="The queues tile"
						recommendation="Approve. It has the cluster view's annotations and paragraphs, said of the applications together, with no box."
						wide
					>
						<Explained spec={siteQueuesExplainer} />
					</State>
				</Part>
				<Part
					step={3}
					title="The applications tile"
					notDeciding="The words on the tile, which are SH 1."
					note="Its headline is the applications in contact, with those out of contact set apart in red, and its chart is the heartbeat chart, with a share for each application in contact."
				>
					<State
						label="The applications tile, while two applications are out of contact"
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
				note="Explainers take over explaining from the hovercards, so the statuses that those hovercards carry need a place of their own. A flag is an icon beside a card's label that is shown only while something is true of what the card is about. A status would be an alert flag, whose hovercard says the status."
			>
				<Part
					step={1}
					title="An alert flag while a status applies"
					notDeciding="The words of each status, which are settled; the kinds of hovercard, which follow; the compact digest's alert flag, which it already has and whose hovercard is SH 2."
					note="On a vital card, which has no label that shows, the flag goes to the left of its icon. On a digest it goes after the name, as the compact digest's does. It is grey for a status that qualifies the figures, and red for one that says something is wrong, matching the red of the card. Point at a flag for its status."
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
				code="ID"
				title="The cluster's and the engine's IDs"
				note="The ID of the cluster, and of the engine that doesn't cluster, is in the hovercard of the vital card's icon today, under the words that the explainer's title replaces. The explainer shows made-up figures, so it can't show a real ID."
			>
				<Part
					step={1}
					title="A hovercard on the icon with only the ID"
					notDeciding="How an ID is shortened and copied, which is settled; IDs elsewhere, such as a stream's on its bar."
					note="The hovercard of the icon keeps the kind and the shortened ID, which can be copied, and loses its paragraph. The other way is to show the ID in the view itself, such as beside the application's name in the title bar, which this review doesn't draw."
				>
					<State
						label="The cluster card's icon"
						recommendation="Approve. An ID is for drilling down, which is what hovercards are for now, and the explainer's &quot;?&quot; at the bottom right leaves the icon free."
						precedents={[
							{
								where: "On the cluster view, the cluster tile's icon",
								status: "settled",
								words: clusterAbout(atSite),
							},
						]}
					>
						<Panel>
							<InfoCard
								subsystem="cluster"
								icon="cluster"
								kind="Cluster"
								identifier={
									<Identifier
										id="5f1e2a7c-8d3b-4c6e-9a0f-2b7d4e1c3a58"
										of="cluster"
									/>
								}
							/>
						</Panel>
					</State>
					<State
						label="The engine card's icon"
						recommendation="Approve, as for the cluster."
						precedents={[
							{
								where: "On the cluster view, the engine tile's icon",
								status: "settled",
								words: engineAbout(atSite),
							},
						]}
					>
						<Panel>
							<InfoCard
								subsystem="cluster"
								icon="engine"
								kind="Engine"
								identifier={
									<Identifier
										id="2c9e4b17-6a3d-4f08-b5e1-9d7a0c3f6e24"
										of="engine"
									/>
								}
							/>
						</Panel>
					</State>
				</Part>
			</Tile>

			<Tile
				code="IC"
				title="Which thing a hovercard is about"
				note="A rule for every hovercard that opens from the page, on every view: where a hovercard says which thing it is about. It comes before the site view's headline hovercards, because the hovercard of a compact digest's alert icon follows it."
			>
				<Part
					step={1}
					title="The thing's name or ID, under its kind"
					notDeciding={
						"The other words of any hovercard, which keep their own reviews; the hovercard of a compact digest's alert icon, which is SH 2 and follows this rule either way; how an ID is shortened and copied, which is settled."
					}
					note="Today a hovercard says which thing it is about in one of three ways: an ID under its kind, copyable, on the hovercards of a cluster, an engine, a stream, a queue and a node; a name under its kind, in bold, on the site view's application hovercards; or the name inside a sentence, on a handler's hovercard. The design doc already says that &quot;figures and identity have their own places, and are never inside a sentence&quot;. The rule makes that concrete: a hovercard about one thing shows, under its kind, the thing's name in bold if it has one, or its ID, shortened and copyable, if all it has is an ID. Sentences may still say where the thing is, such as which application it is in, because that is not its identity."
				>
					<State
						label="A handler's hovercard, under the rule"
						note="The kind is AGGREGATE, as now, and its name, account, is beneath it, where the other hovercards name their thing. The sentence says &quot;this aggregate&quot; and where it is. This is the only hovercard that the rule changes."
						recommendation="Approve. The handler is named where every other hovercard names its thing, so a reader always finds it in the same place, and a handler named &quot;aggregate&quot; still reads clearly."
						precedents={[
							{
								where:
									"On the cluster view, the hovercard of a handler digest's kind icon",
								status: "settled",
								words: handlerKindAbout(atSite, "account", "aggregate"),
							},
						]}
					>
						<Panel>
							<InfoCard
								subsystem={handlerSubsystem("aggregate")}
								icon="aggregate"
								iconColor={kindColors.aggregate}
								kind="aggregate"
								identifier={
									<span className="font-semibold text-fg">account</span>
								}
							>
								<p>
									This section shows information about this aggregate in the{" "}
									<ApplicationName application={atSite} />.
								</p>
								<p>{handlerKindReminders.aggregate}</p>
							</InfoCard>
						</Panel>
					</State>
					<Choices
						of="A"
						title="where a handler's hovercard names the handler"
						choices={[
							[
								"As it is now, with the name in the sentence",
								<HandlerKindCard
									key="now"
									application={atSite}
									name="account"
									kind="aggregate"
								/>,
							],
						]}
					/>
					<State
						label="The hovercards that already follow the rule"
						note="Shown so that the rule can be seen whole; none of them changes. The hovercards of a section about many things, such as the events tile's icon, name no one thing, so they have nothing under their kind."
						recommendation="Approve the rule as these hovercards show it: a name in bold where the thing has one, an ID where it has only an ID, and nothing where the hovercard is about many things."
						wide
					>
						<div className="flex flex-wrap items-start gap-6">
							<Captioned caption="Has a name: an application on a bar">
								<SegmentCard
									about={{
										thing: "application",
										of: "events",
										application: { name: "payments", key: "p" },
										amount: 2140,
										share: 0.1834,
									}}
								/>
							</Captioned>
							<Captioned caption="Has a name: a compact digest's alert icon">
								<ContactLostCard app={contactLostExample} />
							</Captioned>
							<Captioned caption="Has only an ID: the cluster tile's icon">
								<InfoCard
									subsystem="cluster"
									icon="cluster"
									kind="Cluster"
									identifier={
										<Identifier
											id="5f1e2a7c-8d3b-4c6e-9a0f-2b7d4e1c3a58"
											of="cluster"
										/>
									}
								>
									{clusterAbout(atSite)}
								</InfoCard>
							</Captioned>
							<Captioned caption="Has only an ID: a stream on a bar">
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
							<Captioned caption="About many things: the events tile's icon">
								<InfoCard subsystem="streams" icon="event" kind="Events">
									{eventsAbout(atSite)}
								</InfoCard>
							</Captioned>
						</div>
					</State>
				</Part>
			</Tile>

			<Tile
				code="SH"
				title="Site view: the headlines' words"
				note="What each tile's headline and detail line say, and then what the hovercard of each headline says."
			>
				<Part
					step={1}
					title="The headlines and detail lines"
					notDeciding={
						"The hovercards that open when the headlines and detail lines are pointed at (SH 2); the hovercards of the icons (SW); the bars (SB); the charts (SC); the look of the tiles in each state, which is settled (SS)."
					}
					note="The words on the tiles themselves. The events tile's headline is the events per minute, and its detail line gives the events in the event streams of all the applications together, and how many streams there are. The queues tile's is the messages waiting, with those that are failing set apart in orange, as on the cluster view, and its detail line gives the number of queues of all the applications together and the messages handled per minute. The applications tile's is the number of applications in contact, with the number out of contact set apart in red, and its detail line is the word &quot;applications&quot;."
				>
					<State
						label="Two applications out of contact, three with failing messages"
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
					title="The hovercard of a compact digest's alert flag"
					notDeciding={
						"The words on the tiles themselves (SH 1); the explainers of the tiles (SW); the alert flags of the other cards (FL); the hovercards of the bars' segments (SB)."
					}
					note="The hovercard of the alert flag of a compact digest whose application is out of contact. The hovercards that explained the headlines are replaced by the tiles' explainers (SW)."
				>
					<State
						label="The hovercard of a compact digest's alert icon"
						note="It names the application, and its status says what losing contact means for the reader, in the words of the engine card's status, with the application as their subject."
						recommendation="Approve, with this wording. It is the engine hovercard's status with the application as its subject, and &quot;it&quot; in place of saying &quot;the application&quot; twice in one sentence."
						precedents={[
							{
								where:
									"On the cluster view, the status of the engine card while the engine is out of contact, for its words",
								status: { underReview: "FL 1" },
								words: <p>{engineOutText}</p>,
							},
						]}
					>
						<Panel>
							<ContactLostCard app={contactLostExample} />
						</Panel>
					</State>
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
					notDeciding={
						"How a bar is drawn and shaded, which is as on the cluster view; that the applications tile has no bar (SL); the tiles' other hovercards (SW and SH)."
					}
					note="The bars of the events and queues tiles have a segment for each of the busiest applications, largest first, and one for the rest, as a cluster's bars do for streams and queues. A segment's hovercard drills down: the application's name, its amount and its share. It gives no advice, because nothing is promised about how the applications at a site are best spread. With about a hundred applications, the grey segment for the rest takes most of each bar, and whether that is acceptable is part of this decision."
				>
					<State
						label="Pointing at an application on the events bar"
						precedents={[
							{
								where:
									"On the cluster view, the hovercard of a stream on the events bar",
								status: { underReview: "EV 4" },
								words: (
									<>
										<p>{things["event-stream"].bar}</p>
										<p>{things["event-stream"].advice}</p>
									</>
								),
							},
						]}
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
						precedents={[
							{
								where:
									"On the cluster view, the hovercard of a queue on the queues bar",
								status: { underReview: "QU 4" },
								words: (
									<>
										<p>{things.queue.bar}</p>
										<p>{things.queue.advice}</p>
									</>
								),
							},
						]}
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
			</Tile>

			<Tile
				code="SC"
				title="Site view: the applications tile's chart"
				note="The chart along the bottom of the applications tile."
			>
				<Part
					step={1}
					title="The applications tile's chart"
					notDeciding={
						"How the heartbeat chart draws a heartbeat, which is the cluster tile's and settled (CL 5); the tile's headline and words (SW and SH)."
					}
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

			<Tile
				code="EV"
				title="Events tile"
				note="Under review: the status on the hovercard of the icon while only some nodes report what the tile shows, and the hovercard of a segment of the bar, which drills down, with its figures apart from its words. The rest of the tile is settled, including the tile of an engine that appends every event to one stream."
			>
				<Part
					step={0}
					title="The tile"
					notDeciding={
						"What the hovercards say: the status on the icon's hovercard (EV 1) and the hovercard of a segment of the bar (EV 4), though they open when pointed at here."
					}
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
					notDeciding={
						"Which streams the bar shows, and how it is drawn, which are settled; the status on the icon's hovercard (EV 1)."
					}
					decided={false}
					recommendation="Approve. The sentence about the bar is the same each time and has no figures in it, which are the stream's events and share."
					note="Each segment is an event stream, and has the hovercard of that stream: its events and its share of them, then what the bar shows, and the advice about how it is best spread. An engine that appends every event to one stream has no bar, so the hovercard is only ever of one of several streams."
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
					notDeciding={
						"Which queues the bar shows, and how it is drawn, which are settled; the hovercard of a segment of the events tile's bar (EV 4)."
					}
					decided={false}
					recommendation="Approve, as the events tile's bar."
					note="Each segment is a queue, and has the hovercard of that queue: its messages and its share of them, then what the bar shows, and the advice about how it is best spread. An engine that keeps every message in one queue has no bar, so the hovercard is only ever of one of several queues."
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
				<Part
					step={0}
					title="The tile"
					notDeciding={
						"What any hovercard says (CL 2 to CL 4, and WD); the chart, which is settled (CL 5). Only the state of a node that doesn't report its workloads is open here."
					}
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
					notDeciding={
						"How the bar is drawn, which is settled; the hovercard of the workloads in the detail line (CL 3)."
					}
					decided={false}
					recommendation="Approve. A node's hovercard drills down: its workloads and its share are its figures, a node that owns none has no share, and a node that doesn't report its workloads, while others do, shows only its ID, with a status. The words about the bar never change."
					note="Each segment is a node, and has the hovercard of that node. The hovercard drills down: its figures are the node's workloads and its share of them, and its words, about the bar, never change. A node that owns none has no share."
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
						<EngineTile application={application} data={{}} href={undefined} />
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
					notDeciding="The alert flag of the engine while it is out of contact, which is FL; how an explainer looks and opens, which is settled."
					note="It takes the place of the hovercards of the icon and the headline, by the rules of the cluster view's explainers. What &quot;online&quot; means, which the headline's hovercard said, is in its text."
				>
					<State
						label="Online"
						recommendation="Approve. It keeps the hovercard's words about what &quot;online&quot; means, and explains the heartbeat chart as the cluster card's explainer does, for one process."
						wide
					>
						<Explained spec={engineExplainer} />
					</State>
				</Part>
			</Tile>
		</Review>
	);
}

/** An application of the site view's fixture, out of contact. */
/**
 * Flagged draws a card with an alert flag beside its anchor: to the left of a
 * vital card's icon, or after a digest's name. Pointing at the flag shows the
 * status in a hovercard. It shows how a status would look once the hovercards
 * that explain stop carrying statuses.
 */
function Flagged({
	card,
	width,
	anchor,
	after,
	tone,
	status,
}: {
	card: ReactNode;
	width: number;

	/** A CSS selector for what the flag goes beside. */
	anchor: string;

	/** True to put the flag after the anchor, as after a digest's name. */
	after?: true;

	/** "bad" for red, "qualifies" for the grey of a status that qualifies. */
	tone: "bad" | "qualifies";
	status: ReactNode;
}) {
	const ref = useRef<HTMLDivElement>(null);
	const [at, setAt] = useState<{ x: number; y: number }>();
	useLayoutEffect(() => {
		const el = ref.current;
		const target = el?.querySelector(anchor);
		if (!el || !target) {
			return;
		}
		const box = el.getBoundingClientRect();
		const r = target.getBoundingClientRect();
		setAt({
			x: after ? r.right - box.left + 6 : r.left - box.left - 22,
			y: r.top + r.height / 2 - box.top - 8,
		});
	}, [anchor, after]);
	return (
		<div ref={ref} className="relative" style={{ width }}>
			{card}
			{at && (
				<span className="absolute z-20" style={{ left: at.x, top: at.y }}>
					<Popover card content={status}>
						<span
							className={cn(
								"flex size-4 cursor-help",
								tone === "bad" ? "text-bad" : "text-fg-soft",
							)}
						>
							<Icon name="alert" className="size-4" />
							<span className="sr-only">Status</span>
						</span>
					</Popover>
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
		anchor: "svg.size-5",
		tone: "qualifies" as const,
		card: (
			<EventsTile
				application={application}
				data={{ ...overview.events, coverage: 0.67 }}
				href={undefined}
			/>
		),
		status: (
			<InfoCard
				subsystem="streams"
				icon="event"
				kind="Events"
				status={partialStatus}
			/>
		),
	},
	{
		label: "The queues tile, while no new samples are arriving",
		note: "Today the status is in the hovercard of the rate.",
		recommendation: "Approve, as for the events tile.",
		width: 360,
		anchor: "svg.size-5",
		tone: "qualifies" as const,
		card: (
			<QueuesTile
				application={application}
				data={overview.queues}
				href={undefined}
			/>
		),
		status: (
			<InfoCard
				subsystem="queues"
				icon="message"
				kind="Queues"
				status={{
					icon: "alert",
					text: "No new samples are arriving, so this average is out of date.",
				}}
			/>
		),
	},
	{
		label: "The cluster tile, while every node is out of contact",
		note: "Today the status is in the hovercard of the nodes.",
		recommendation:
			"Approve, in red, because something is wrong, as the tile's red 0 and accent already say.",
		width: 360,
		anchor: "svg.size-5",
		tone: "bad" as const,
		card: (
			<ClusterTile
				application={application}
				data={{ ...overview.cluster, nodes: [] }}
				href={undefined}
			/>
		),
		status: (
			<InfoCard
				subsystem="cluster"
				icon="cluster"
				kind="Cluster"
				status={{ icon: "alert", text: noNodesText }}
			/>
		),
	},
	{
		label: "A handler digest, while only some nodes report it",
		note: "Today the status is in the hovercard of the kind icon. The flag goes after the name, as on a compact digest.",
		recommendation: "Approve, as for the events tile.",
		width: 360,
		anchor: "span[id]",
		after: true as const,
		tone: "qualifies" as const,
		card: (
			<HandlerDigest
				application={application}
				handler={{
					...(overview.handlers[0] as OverviewData["handlers"][number]),
					coverage: 0.5,
				}}
			/>
		),
		status: (
			<InfoCard
				subsystem={handlerSubsystem("aggregate")}
				icon="aggregate"
				iconColor={kindColors.aggregate}
				kind="aggregate"
				identifier={<span className="font-semibold text-fg">account</span>}
				status={partialStatus}
			/>
		),
	},
];

const contactLostExample = withContact(siteApplications, { out: ["kyc"] }).find(
	(a) => a.application.name === "kyc",
) as SiteData["applications"][number];

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

/** The application of the cluster view's fixture, at a site. */
const atSite = { ...application, site: "eu-west" };

/**
 * The applications of the site view, all in contact, with no failing messages,
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
/** A handler digest of a process, with buttons that change the numbers on it. */
/** A count of failing messages after a number, with buttons that change it. */

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

/**
 * The site of the explainers of the site view's tiles: six applications in
 * contact, two of which have failing messages.
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
 * The site of the applications tile's explainer, with two applications out of
 * contact.
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
			side: "left",
			atText: true,
			with: [{ at: ":scope > article > span", atText: "events per minute" }],
			approach: "top-left",
			dy: -40,
		},
		{
			at: ":scope > article > span",
			text: "total number of events on the applications' event streams",
			side: "top",
			atText: `${formatCompact(explainedSite.events?.streams?.events ?? 0)} events`,
		},
		{
			at: ":scope > article > span",
			text: "the number of event streams the applications have",
			side: "right",
			atText: `${formatCompact(explainedSite.events?.streams?.count ?? 0)} streams`,
			bow: "under",
		},
		{
			at: "div.h-2",
			text: "how the new events are spread across the applications",
			side: "left",
			dy: 6,
		},
		{
			at: "svg.h-12",
			text: "events recorded over the last minute",
			side: "right",
			into: "chart",
		},
		{ at: "[data-moon]", text: "the moon", side: "right" },
	],
	paragraphs: [
		{
			text: "Each event that an application records is written to an event stream. Streams store events in the order they are written, so they can be read in that order.",
			when: { has: "stream" },
		},
	],
	before: [
		"Icon: This section shows information about the events and event streams of the applications at the eu-west site.",
		`Headline: ${siteEventRateWords.description}, averaged over the last minute.`,
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
			side: "top",
			wordsLeft: true,
			atText: true,
			keepInk: true,
		},
		{
			at: ":scope > article > span",
			text: "the number of queues the applications have",
			side: "top",
			atText: `${formatCompact(explainedSite.queues?.queues ?? 0)} queues`,
		},
		{
			at: ":scope > article > span",
			text: "the rate of handled messages across the applications, averaged over the last minute",
			side: "right",
			atText: "/min",
			dy: -4,
		},
		{
			at: "div.h-2",
			text: "how the ready messages are spread across the applications",
			side: "left",
			dy: 6,
		},
		{
			at: "svg.h-12",
			text: "messages handled over the last minute",
			side: "right",
			into: "chart",
		},
		{ at: "[data-moon]", text: "the moon", side: "right" },
	],
	paragraphs: [
		"Commands and deadlines wait on queues until they are delivered. A command is ready to be delivered as soon as it is queued, and a deadline once its scheduled time arrives.",
		"Fewer ready messages is better. If the number keeps rising, messages are becoming ready faster than they are being handled.",
	],
	before: [
		"Icon: This section shows information about the messages and queues of the applications at the eu-west site.",
		`Headline: ${messagesWaitingText}`,
		`Rate: ${siteHandlingWords.description}, averaged over the last minute.`,
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
			text: "the number of applications in contact now",
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
			text: "the number of applications out of contact",
			side: "top",
			atText: true,
			keepInk: true,
		},
		{
			at: "canvas",
			text: "how recently each application sent a heartbeat",
			side: "right",
			into: "chart",
		},
	],
	paragraphs: [
		"Each application's nodes send heartbeats to show that they are running. An application's section of the heartbeat chart rises with each heartbeat and falls until the next, so it sinks to the bottom if the heartbeats stop.",
	],
	before: [
		"Icon: This section shows information about the applications at the eu-west site.",
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
			text: "whether the engine is in contact now",
			side: "left",
			atText: true,
			approach: "top-left",
			dy: -40,
		},
		{
			at: "canvas",
			text: "how recently the engine sent a heartbeat",
			side: "right",
			into: "chart",
		},
	],
	paragraphs: [
		"The engine is online while it is in contact, so the figures shown are current.",
		"The engine sends heartbeats to show that it is running. The heartbeat chart rises with each heartbeat and falls until the next, so it sinks to the bottom if the heartbeats stop.",
	],
	before: [
		"Icon: This section shows information about the engine that runs the statements application at the eu-west site.",
		"Headline: The engine is online while it is in contact, so the figures shown are current.",
	],
};
