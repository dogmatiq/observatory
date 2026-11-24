import { useEffect, useRef, useState } from "react";
import { application, overview } from "../fixtures/overview.ts";
import {
	euWest,
	siteApplications,
	siteOf,
	withContact,
} from "../fixtures/site.ts";
import { Covered } from "../lib/distrust.tsx";
import { formatCompact, formatPercent } from "../lib/format.ts";
import { LiveData } from "../lib/live.tsx";
import type { Application, OverviewData, SiteData } from "../model.ts";
import {
	NodesCard,
	nodesText,
	noNodesText,
	WorkloadsCard,
} from "./ClusterCards.tsx";
import { EngineCard } from "./EngineCard.tsx";
import { Identifier } from "./Identifier.tsx";
import { InfoCard } from "./InfoCard.tsx";
import { messagesWaitingText } from "./MessagesWaitingCard.tsx";
import {
	ClusterTile,
	clusterAbout,
	countedWords,
	EngineTile,
	EventsTile,
	engineAbout,
	eventRateWords,
	eventsAbout,
	QueuesTile,
	queuesAbout,
	Totals,
} from "./Overview.tsx";
import { partialText } from "./partial.ts";
import { Ramped } from "./Ramped.tsx";
import { RateCard } from "./RateCard.tsx";
import { Choices, Panel, Part, Review, State, Tile } from "./review.tsx";
import { SegmentCard, things } from "./SegmentCard.tsx";
import {
	ApplicationCells,
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
 * all of them and not only the one that the data happens to be in. The tiles are
 * in the order in which their decisions depend on each other: what is open about
 * a layout first, then about states, then about words. Each tile is
 * shown whole, and then part by part, in the order of review, from the least
 * specific to the most: its icon, its headline, its detail line, its
 * bar and its chart. A card whose words never change, and that has a status in
 * some states, is shown once, with its status.
 *
 * A popover is drawn where it stands, in the frame of a panel, because a person
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
						"What the tiles and the cards say, the made-up figures, the bars and the charts, which come in later chunks; how the view looks when messages fail or contact is lost (SS); whether the grid is of cards or of squares (SL 1)."
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
						"What a card's figures are, and what their popovers say (SH); how a card looks when its application's messages fail or contact with it is lost (SS); the order of the applications (SL 0)."
					}
					note="Each application is a small card with its name, its events per minute and its messages waiting, which links to its application view. The alternative is the plan's first idea, a grid of squares like a contribution graph, which names an application only when it is pointed at."
				>
					<State
						label="Cards with names and figures"
						recommendation="Approve. A reader finds an application by its name at a glance, and sees its figures without pointing at it. A hundred cards fit in about a screen."
						wide
					>
						<SiteBreakdown data={siteOf(calm, euWest)} breakdown="cells" />
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
				note="How the view looks as its applications' messages fail and as contact with them is lost: the accents, the blur and the words that take the place of a card's figures. The words of the tiles' cards come in the next chunk."
			>
				<Part
					step={0}
					title="The view in each state"
					notDeciding={
						"The layout (SL); what the tiles and their cards say, including the card that explains the applications tile's headline (SW and SH); the bars (SB); the applications tile's chart (SC). All of them are shown, but none of them is decided here."
					}
				>
					<State
						label="Three applications with failing messages"
						note="checkout, mailer and regulatory-reports have the orange accent and the orange &quot;+N&quot;, as a handler card does, and so does the queues tile."
						recommendation="Approve, as the cluster view does it."
						wide
					>
						<SiteDemo data={siteOf(siteApplications, euWest)} />
					</State>
					<State
						label="Two applications out of contact, and two with only some nodes in contact"
						note="The two out of contact, kyc and payroll, have the red accent and a red alert icon at the right of their names, as the other cards have their icon there, and pointing at the icon shows a card that says contact with the application has been lost. Their figures keep their places as blurry zeros, which glitch when contact is lost. The blur says how far a figure is trusted, and the red says that contact is lost. The figures of the two partly in contact, orders and payments, are blurred by the coverage rule, and so, slightly, are the totals. The applications tile's headline is the applications in contact, with those out of contact set apart in red, as in &quot;94 +2&quot;, as the queues tile sets apart failing messages in orange, and the tile has the red accent while any application is out of contact, because an application out of contact is one that nothing shows to be working, unlike a node, whose cluster's other nodes carry on."
						recommendation="Approve, with the icon. It takes no room from the name, so a long name isn't cut short, and its card gives the words, as the status of a card does elsewhere. The red accent and the icon mark an application out of contact as the cluster tile marks a cluster with no nodes, and the blur is the coverage rule's."
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
						title="how a cell says that contact is lost"
						framed={false}
						choices={(
							[
								["Words beside the name: Contact lost", "Contact lost"],
								["Words beside the name: No contact", "No contact"],
								["Words beside the name: Offline", "Offline"],
							] as const
						).map(([label, words]) => [
							label,
							<ApplicationCells
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
				title="Site view: the icons' words"
				note="What the card of each tile's icon says."
			>
				<Part
					step={1}
					title="The icons"
					notDeciding={
						"How the cards look, which is as on the cluster view; the cards of the headlines (SH); the words in a card of the grid (SS); what a site is, which nothing on the view explains yet."
					}
					note="The card of each tile's icon says what its section is about. Nothing on the view says what a site is yet. While only some of the applications' nodes report what the events or queues tile shows, its card says why, as a status. It says nothing about versions, because the applications at a site run different engines and versions as a matter of course."
				>
					<State
						label="The events tile, while only some nodes report it"
						precedents={[
							{
								where: "On the cluster view, the events tile's icon",
								status: "settled",
								words: eventsAbout(atSite),
							},
							{
								where: "Its status",
								status: { underReview: "EV 1" },
								words: <p>{partialText(undefined)}</p>,
							},
						]}
						recommendation="Approve, with this wording, which was proposed in review, with &quot;at the eu-west site&quot;, as the cluster view says where an application is. The tile counts the event streams of all the applications together in its detail line."
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
						precedents={[
							{
								where: "On the cluster view, the queues tile's icon",
								status: "settled",
								words: queuesAbout(atSite),
							},
							{
								where: "Its status",
								status: { underReview: "EV 1" },
								words: <p>{partialText(undefined)}</p>,
							},
						]}
						recommendation="Approve, with this wording, in the same shape as the events tile's. The tile counts the queues of all the applications together in its detail line, which says roughly how widely the site's work can be spread."
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
						precedents={[
							{
								where: "On the cluster view, the cluster tile's icon",
								status: "settled",
								words: clusterAbout(atSite),
							},
						]}
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
						note="The same cards, for the applications that run at no site, which have no site to name, so they name the applications."
						recommendation="Approve, with this wording."
					>
						<div className="grid gap-3">
							<Panel>
								<InfoCard subsystem="streams" icon="event" kind="Events">
									{siteAbout.events(undefined)}
								</InfoCard>
							</Panel>
							<Panel>
								<InfoCard subsystem="queues" icon="message" kind="Queues">
									{siteAbout.queues(undefined)}
								</InfoCard>
							</Panel>
							<Panel>
								<InfoCard
									subsystem="cluster"
									icon="application"
									kind="Applications"
								>
									{siteAbout.applications(undefined)}
								</InfoCard>
							</Panel>
						</div>
					</State>
				</Part>
			</Tile>

			<Tile
				code="SH"
				title="Site view: the headlines' words"
				note="What the card of each tile's headline says, and the detail lines."
			>
				<Part
					step={1}
					title="The headlines and detail lines"
					notDeciding={
						"The card of the messages waiting, which is the cluster view's and settled; the cards of the icons (SW); the cards of the bars' segments (SB)."
					}
					note="The events tile's headline is the events per minute, and its detail line gives the number of event streams of all the applications together, as in &quot;in 412 streams&quot;. The queues tile's is the messages waiting, with those that are failing, as on the cluster view, and its detail line gives the number of queues of all the applications together and the messages handled per minute, as in &quot;messages in 37 queues, 19.6K/min&quot;. The applications tile's is the number of applications in contact, with the number out of contact set apart in red, as in &quot;94 +2&quot;, and its detail line is the word &quot;applications&quot;."
				>
					<State
						label="The card of the applications in contact"
						precedents={[
							{
								where: "On the cluster view, the card of the cluster nodes",
								status: { underReview: "CL 2 and WD 1" },
								words: <p>{nodesText}</p>,
							},
							{
								where: "Its status",
								status: { underReview: "WD 2" },
								words: <p>{noNodesText}</p>,
							},
							{
								where: "The card of the messages waiting",
								status: "settled",
								words: <p>{messagesWaitingText}</p>,
							},
						]}
						note="Its status is there only while every application is out of contact."
						recommendation="Approve, with this wording and example. It covers an engine that clusters and one that doesn't, so it says &quot;its engine, or any node of its cluster&quot;, and its example is the messages waiting card's, with red in place of orange. The status follows the cluster's &quot;Every node is out of contact, so it's unknown whether the application is working&quot;."
					>
						<Panel>
							<ApplicationsCard live={0} />
						</Panel>
					</State>
					<State
						label="The card of the events per minute"
						precedents={[
							{
								where: "On the cluster view, the card of the events per minute",
								status: "settled",
								words: (
									<p>
										{eventRateWords.description}, averaged over the last minute.
									</p>
								),
							},
						]}
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
						precedents={[
							{
								where:
									"On the cluster view, the card of the messages handled per minute",
								status: "settled",
								words: (
									<>
										<p>
											{countedWords.handled.description}, averaged over the last
											minute.
										</p>
										<p>{countedWords.handled.note}</p>
									</>
								),
							},
						]}
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
			</Tile>

			<Tile
				code="SB"
				title="Site view: the bars"
				note="The card of a segment of the events and queues tiles' bars."
			>
				<Part
					step={1}
					title="The bars"
					notDeciding={
						"How a bar is drawn and shaded, which is as on the cluster view; that the applications tile has no bar (SL); the tiles' other cards (SW and SH)."
					}
					note="The bars of the events and queues tiles have a segment for each of the busiest applications, largest first, and one for the rest, as a cluster's bars do for streams and queues. A segment's card drills down: the application's name, its amount and its share. It gives no advice, because nothing is promised about how the applications at a site are best spread. With about a hundred applications, the grey segment for the rest takes most of each bar, and whether that is acceptable is part of this decision."
				>
					<State
						label="Pointing at an application on the events bar"
						precedents={[
							{
								where:
									"On the cluster view, the card of a stream on the events bar",
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
									"On the cluster view, the card of a queue on the queues bar",
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
				note="Under review: the status on the card of the icon while only some nodes report what the tile shows, and the card of a segment of the bar, which drills down, with its figures apart from its words. The rest of the tile is settled, including the tile of an engine that appends every event to one stream."
			>
				<Part
					step={0}
					title="The tile"
					notDeciding={
						"What the cards say: the status on the icon's card (EV 1) and the card of a segment of the bar (EV 4), though they open when pointed at here."
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
					step={1}
					title="The icon"
					notDeciding={
						"The blur and the glitch (EV 0); the card's first paragraph, which is settled."
					}
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
					notDeciding={
						"Which streams the bar shows, and how it is drawn, which are settled; the status on the icon's card (EV 1)."
					}
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
						"Which queues the bar shows, and how it is drawn, which are settled; the card of a segment of the events tile's bar (EV 4)."
					}
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
				<Part
					step={0}
					title="The tile"
					notDeciding={
						"What any card says (CL 2 to CL 4, and WD); the chart, which is settled (CL 5). Only the state of a node that doesn't report its workloads is open here."
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
					notDeciding={
						"The words for contact in the card's first sentence and in its status (WD 1 and WD 2); the card of the workloads (CL 3)."
					}
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
										A node is one running process of the application's engine.
										Together, the nodes form a cluster that shares the
										application's work.
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
										A node is one running process of the application's engine.
										Together, the nodes form a cluster that shares the
										application's work. The number counts the nodes that are in
										contact now.
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
										A node is one running process of the application's engine.
										Together, the nodes form a cluster that shares the
										application's work.
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
										A node is one running process of the application's engine.
										Together, the nodes form a cluster that shares the
										application's work.
									</p>
									<p key="1">A node that has lost contact is not counted.</p>
								</InfoCard>,
							],
						]}
					/>
				</Part>

				<Part
					step={3}
					title="The detail line"
					notDeciding={
						"The card of the words “cluster nodes”, which is the headline's (CL 2); the bar (CL 4)."
					}
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
					notDeciding={
						"How the bar is drawn, which is settled; the card of the workloads in the detail line (CL 3)."
					}
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
					notDeciding={
						"The words for contact in the card (WD 3 to WD 5); the chart (EN 3)."
					}
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
										Online means that the engine is in contact, so the figures
										on this page are current.
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
										While the engine is online, this page shows what the engine
										is doing now.
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
					notDeciding={
						"The status of the same card (WD 2); the rest of the card (CL 2)."
					}
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
					notDeciding={
						"The card's first sentence (WD 1); the rest of the card (CL 2)."
					}
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
					notDeciding={
						"The second half of the sentence (WD 4); the status (WD 5); the rest of the card (EN 2)."
					}
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
					notDeciding={
						"The first half of the sentence (WD 3); the status (WD 5); the rest of the card (EN 2)."
					}
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
					notDeciding={
						"The card's sentence (WD 3 and WD 4); the rest of the card (EN 2)."
					}
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
		</Review>
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
