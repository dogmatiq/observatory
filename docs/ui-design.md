# UI design rules

This document holds the rules that the Observatory's pages follow, each with the
reason for it. Use it to design a new part of a page, or to check one, so that
it comes out the way the existing parts did.

The rules came from reviewing each part of the cluster view in every state that
it can be in. Where a rule has an exception, the exception is written next to it.

## Words

### Terms

The page uses these words with these meanings, and no other word for them.

- **Engine**: the software that an application runs on. What it can do, such as
  whether it clusters or divides its work into workloads, is said of the engine.

- **Node**: one running process of an engine, as a member of its cluster. What has
  an ID, a heartbeat, a state of being online or offline, or workloads that it
  owns, is a node.

- **Cluster**: the nodes that share the work of one application.

- **Workload**: an ongoing task that the cluster gives to one of its nodes. A node
  owns each workload.

- **Signal**: what a node sends to show that it is running. A node is sending a
  signal while its connection to the Observatory is open and, if it sends
  heartbeats, while each one arrives before its deadline. An application is
  sending a signal while any of its nodes is, and the views say that the
  application sends it, though its engine does. "Online" means sending a signal.

- **Digest**: the box, below a view's tiles, of one of the parts of what the view
  is about, such as a handler on the cluster view. A digest links to its part's
  own view, if the part has one (see Look).

- **Compact digest**: a digest with only a name and one line of figures, and no
  icon of its own, such as an application on the site view. A kind of part has
  digests or compact digests by how many of them a view is expected to have, and
  by nothing else: both sizes do the same things on the page, and a view never
  changes from one to the other, whatever the count is and whatever the reader
  does.

- **Hovercard**: a small card about one thing that appears beside it while it
  is pointed at, has the keyboard's focus or is tapped. It starts with the
  thing's icon, its name and its kind, and can hold links or a button, such as
  the trail's, which copy a key or an ID, so the pointer can move onto it.

- **Tooltip**: words alone, a line or a sentence, that appear in the same way,
  with no icon, no name of a thing and nothing to press, such as the whole of a
  name that is cut short, or the status of an alert flag.

- **Readout**: at most two short lines beside a card's icon that say what is at
  the place on the card's chart or bar that is pointed at: the thing, in the
  muted color, over its measurement, in the color of the chart or the bar.

- **Annotation**: hand-lettered words, with a hand-drawn arrow, that point at one
  part of a figure or a card and say what that part is, such as the labels of the
  worked example of a number set apart.

- **Flag**: an icon beside a card's label that is shown only while something is
  true of what the card is about, such as the flag of a handler that asks the
  engine to minimize concurrency, or the alert flag of an application with
  no signal. It is absent otherwise, and never shows the opposite case.

- **Metric**: a measurement that a node reports, such as the events it records
  per minute. A section's numbers, bars and charts are made from metrics. A
  node reports metrics; a section shows them.

- **Particulars**: the line under a tile's headline, which gives the headline's
  unit and the figures that go with it, such as "cluster nodes, 5 workloads".

Checklist:

- "Node" appears only where there is a cluster. An engine that doesn't cluster
  is "the engine", and its explainer mentions neither nodes nor clusters.

  _Why: a reader of an engine that doesn't cluster has never met a node, and the
  word would make them look for others._

- A signal that stops is described as there being no signal from the thing. The
  page says that the signal has stopped, and doesn't conclude that the thing
  itself has stopped.

  _Why: the page can't tell a process that has stopped from one that it can't
  reach._

- "Reporting" is not used for sending a signal.

  _Why: it reads as sending data._

- "Report" is used for nodes sending data, such as "Only some of the
  cluster's nodes report their workloads".

  _Why: it is what the word means to a reader. "Send their workloads" read as
  handing the tasks over, and "say" was not liked._

- "Heartbeats" doesn't define the signal. An explainer of the heartbeat chart
  may say that nodes send heartbeats, because the chart is drawn from them.

  _Why: not every engine sends heartbeats._

- "Load" is not used on its own for how busy a node is. Use "busier", "how
  much work", or name the resources, such as CPU and memory.

  _Why: "load" is too like "workload", which means something else here._

- The way that a bar's amounts are divided among its segments is a spread:
  "how the events are spread across the streams", "an even spread". It is
  not a distribution, and the amounts are not shared among the segments.

  _Why: one word for one idea, and "distribution" also has a statistical
  meaning, and suggests distributed systems._

- "Between" is not used for a spread; use "across".

  _Why: "between" suggests two._

- Words that stand alone start with a capital, such as "Online" and
  "Offline" on the engine tile. Words that continue a figure are lower case,
  such as the particulars "cluster nodes, 5 workloads".

- A word that reaches the reader is chosen by the project's owner, by seeing it
  in the sentence that it would be in. Where the code has a name for a concept
  that the page shows, it uses the page's word for it, so that one concept has
  one name.

### Sentences on hovercards

- Text that explains, such as an explainer's paragraphs, never changes in small
  ways that a reader could miss. A whole paragraph is there or isn't, and each
  paragraph states something that can be taken as a fact. What depends on the
  engine is in the inset box (see Explainers).

  _Why: a reader never hunts for a detail that moved, and never rereads a
  sentence that was reworded._

- Each sentence is positive. "Not every node…" and "No node is…" become "Only
  some of the cluster's nodes…" and a statement of what is so.

  _Why: a negation makes the reader work out what is true._

- Where a sentence must be negative and its verb is an action, the verb is
  negated: "the engine doesn't send any heartbeats", not "the engine sends
  no heartbeats". A verb of being or having may take "no": "there is no
  signal", "the application has no signal", "an application with no
  signal".

  _Why: "sends no heartbeats" describes an action done to nothing, which the
  reader has to undo; "has no signal" just states that something is absent._

- A conclusion follows from its reason. "There is no signal from any of the
  nodes, so the cluster is offline" would be wrong: no signal doesn't show
  that the cluster stopped. "…so it's unknown whether the application is
  working" follows.

- A status says what it means for the reader, not only how it happened, and
  strongly enough. "They may have stopped handling messages" was too weak for
  "nothing shows whether any work is getting done".

- A thing is named again rather than pointed back at with a pronoun that
  stands for it alone, such as "it", "them", "they", "theirs" or "this one",
  when the thing is outside the sentence, such as the hovercard's title, or when
  another noun between them could be meant. "…with the same number of them"
  became "…with the same number of workloads", and "There is no signal from
  it" became "There is no signal from the engine". A possessive before a
  noun, such as "its streams" or "their workloads", is fine when it refers to
  the subject of its own clause, and so is "it's unknown".

  _Why: the reader has to stop and work out what the pronoun means, and with two
  plural nouns, such as nodes and workloads, the reader can guess wrong.
  Repeating the noun costs a word._

- Every sentence is finished: it doesn't leave out words for the reader to
  supply. "…busier than another that owns as many" became "…busier than
  another node with the same number of workloads", and "…until every node
  does" names what every node does.

  _Why: the reader has to rebuild the missing words. It isn't ungrammatical, but
  it is unusual, and hard for a reader whose first language isn't English.
  Repeating the words costs a few more._

- A sentence is true in every case that the page can show. "Only the
  cluster's other nodes report their workloads" is wrong when two nodes don't
  report theirs, because "the other nodes" means all of them. Count the cases,
  such as one, several or all, before writing "the other", "only" or "every".

- The page doesn't say "deploy", and a status doesn't guess at a cause that the
  page can't see. It says what the nodes do and what follows for the reader.

  _Why: the page can't know that a deploy is happening, and "deploy" reads as
  something that the engine itself does. A guess is a variant that the reader
  must keep in mind._

- Nothing is circular, such as "a node is live when the nodes say it is".

- The words are plain: "is working", not "is making any progress"; "rough
  guide" or a plain example, not "proxy"; "vary in size", not "heterogeneous".

- A sentence that invites "why?" answers it. "One node can be much busier
  than another with the same number of workloads" became "Some workloads have
  much more to do than others, so…"

- An example applies to every engine, such as "delivering messages to one of
  the application's handlers", and gives the action to what performs it: a
  node delivers, a handler handles.

- A hovercard doesn't say "the figure", or "page": the user is using an app,
  not reading a page. It doesn't name the Observatory: there is a signal from
  a node, or none, and what receives it goes unsaid.

- A hovercard keeps to about forty words.

## Hovercards

A card's explainer (see Explainers) says what its parts are, so a hovercard only
drills down: it is about one thing, and its figures and identity vary. No icon
or figure of a card opens a hovercard, and neither does a segment of a bar,
which the card's readout names instead (see Readouts).

Checklist:

- An identity, such as a key or an ID, has its own place, and is never inside a
  sentence. Figures have their own places too, except in the particulars, which
  are figures with their nouns rather than prose.

- A hovercard about one thing starts with the thing's name, in bold capitals,
  then its kind, as a digest does.

  _Why: a name in other letters than the digest's would read as a different
  thing._

- An alert flag opens a tooltip of its status, not a hovercard, as the name of
  what it flags is beside it.

- On a screen that is touched, a tap does what pointing does: it opens a
  hovercard or a tooltip, or shows a readout. A tap on the same thing again, or
  anywhere else, ends it.

  _Why: a finger can't point._

- Prose about whether a figure can be given now, and why, is a status, which
  the card's alert flag says while it applies, and never otherwise.

- An alert flag is grey while each of its statuses qualifies the card's
  figures, which are still worth reading, and red while any says that
  something is wrong. A card has one flag, whose tooltip says each status that
  applies.

- A status has one fixed text for each cause, whatever else is true at the time,
  and is never put together from parts. When several causes apply at once, the
  statuses are ranked to choose which the flag shows. How they are ranked is
  still to be decided.

  _Why: every variant is one more for the reader, and the reviewer, to hold in
  mind._

## Explainers

An explainer explains a whole vital card or digest at once: a dialog with a copy
of the card in the middle, annotations around it that say what each part is, and
a few paragraphs under it. Hovercards and readouts are then only for drilling
down. The
events vital card's explainer is the model for the others.

- The copy of the card shows what its numbers mean, with made-up data, not
  how sure they are: its numbers are never blurred, and its flag shows only
  a status that says that something is wrong.

  _Why: the blur doesn't help a reader understand what a number means, and on a
  real card the warning icon explains the blur when it appears._

Opening and closing:

- A "?" at the bottom right of every vital card and digest opens its
  explainer. It shows while the card is pointed at or has the keyboard's
  focus, and always on a touch screen, which can't point. It is a filled
  circle in the color of the card's chart, or of the ground of the sky that
  is there in its place, or in the accent color on a card with neither, with
  the "?" in the card's background color, a step
  larger than a small icon, so that it is noticed when it appears.

- The card zooms from its place on the page to the middle of the window, as
  large as the window has room for, up to one and a half times, and never
  smaller than on the page. The page behind is blurred and doesn't scroll;
  the explainer scrolls if it is taller than the window.

- Escape, the close icon at the top right, or a click outside the card
  closes it. A click that ends a selection of text doesn't.

The card:

- The copy is the real component, in its own colors and not in gray, with
  made-up figures, and nothing in it can be pressed. A small caption under
  it, at the right, in the ordinary type and not the hand-lettered one, says
  "Example data only".

- The figures are fixed for each layout, and chosen so that every state
  worth explaining is shown, such as a "+N" and blur, and so that each
  chart is high near its right end, where its arrow ends.

- It shows only what this card can show, by the rules for adapting to the
  engine: a part that this card never has, such as the bar of an engine with
  one event stream, is not in its explainer, and nor is its annotation or
  its paragraph.

- A card narrower than the text under it, such as a compact digest, keeps
  its own width and is centred over the text.

- Under the card and its caption, a title says what the card is about and
  where, as "The events and event streams of the statements application at
  the eu-west site". It starts the text under the card, in a darker color
  than the paragraphs after it, so that all of the ordinary type is under
  the card and the hand-lettered annotations are around it.

Annotations:

- Each annotation is a few hand-lettered words that say what one part is,
  in the reader's terms: "the rate of new events, averaged over the last
  minute", not the card's own "events per minute", which the figure is
  already labelled with.

- Every figure gets an annotation, including each figure in the
  particulars. The headline's annotation is of the figure and its label together.
  An icon that only marks what the card is about, such as its kind of
  handler, gets none; one that says something, such as that a handler asks
  the engine to minimize concurrency, gets one. The moon, on a card whose sky has it, gets one that
  says only "the moon", and the explainer's copy shows it already risen.

- An annotation of a figure says what the figure counts, such as "the
  number of event streams the application has" or "total number of events on
  the application's event streams". A chart's says what it shows over time,
  as "events recorded over the last minute". A bar's says how what is spread
  across what, as "how the events are spread across the streams".

- An arrow ends at the middle of what it is about, and points at a figure
  itself, even when the figure's label is in focus with it. Where it can,
  it comes in level with the figure, or straight down onto it from above
  the card, rather than turning a corner. The headline's arrow
  ends at the top left of its figure. A chart's ends in the shaded area
  under the line, near its right end, curving down in the middle, and never
  on the line.

- An arrow comes in from above or below, rather than from the side, when that
  keeps it off other words. It doesn't cross words, a bar or an icon.

- An annotation is beside the card, on the side nearer its part. It is
  above the card when its part is far from both sides and an arrow can
  reach it from above without crossing words, so that its arrow is short,
  as for a "+N" next to the headline or a figure in the middle of the
  particulars. It starts just to the right of its part, or ends just to the
  left of it when a part to its right needs that room, and its arrow leaves
  the side of the words nearer the part.

- An arrow leaves the side of its annotation nearer its part, halfway
  between its lines, and its line starts by heading away from the words, at
  no more than 10° from straight away, so that it is plainly drawn from
  them. Where an arrow would leave more steeply, its words move up or down
  a little, and its curve is flattened where it leaves them. A short arrow
  bows less, so that one to a bar points along the bar rather than down
  onto its end. Annotations keep a clear space between them, at their tilted
  ends too, whether they are beside the card or above it, and the text
  under the card starts below any that reach past the card's foot.

- An arrow's line ends straight, so that it arrives between the two strokes
  of its head, and never along or outside one of them.

- A line drawn on from an arrow's head meets the part that it is about. An
  arrow from the side ends level with the middle of its part and points at
  the part's middle, so that one to a bar points into the bar and not along
  its edge.

- Pointing at an annotation, or at its part, focuses the part: the rest of
  the card fades back, focused words are drawn in the most prominent color,
  the annotation is marked as if with a highlighter pen, yellow on the
  light ground and lime on the dark one, and the other annotations fade. A
  figure is focused with its label, such as "2 streams", and a count of
  messages with the "+N" of its failing ones, which keep their orange. Only
  annotations and their parts focus anything; pointing at a paragraph under
  the card, such as a bar's advice, doesn't.

- In a window too narrow for the annotations beside the card at their full
  size, each is a numbered marker on the card, and the annotations are
  listed under the card by number. Pointing at or pressing either focuses
  the part.

Paragraphs under the card:

- They say what the card's annotations can't: what a term means, and advice
  about a part, such as a bar. Each is there only when the card shows the
  part that it is about. They follow the card from top to bottom, and are
  kept short.

- A paragraph starts from what the reader already knows, such as the
  application's events or a cluster's nodes, and describes what happens, as
  "Each node sends heartbeats to show that it is running", rather than
  defining a term, as "A heartbeat is…" would. Dogma's own terms, such as
  event and aggregate, are assumed.

- It says only what Dogma's documentation or the spec promises, and leaves
  out promises that the card doesn't need, such as the order in which events
  are delivered or an event's position on its stream. It doesn't mention the
  engine unless the engine is what the sentence is about; where it isn't,
  the sentence is passive, as "is written to an event stream".

- A bar has advice only when Dogma's documentation or the spec promises what an
  even spread does for the application, so a bar of nodes or of an aggregate's
  instances has none. The advice names what is spread, as "An even spread across
  the streams is better", and is in the explainer, not in the readouts of the
  bar's segments.

- What depends on the engine that runs this application, and isn't true
  of every application, is in a box on a sunken ground, with the engine
  icon. A card that is shown only for some engines, such as the cluster
  card, already says what its box would, so it has no box. Its first sentence has the engine as its subject, named through
  the application in bold: "The **statements** application's engine
  spreads events across several event streams." The bar's advice, if any,
  goes in the same box. The box is there whenever the card shows the part
  that it is about. Its text is the same size and color as the paragraphs, and the
  application's name is bold, in the color of ordinary text, a step
  darker than the paragraphs; the ground and the icon set the box apart,
  and only the title leads.

## Readouts

A card shows what is at the place on its chart or its bar that is pointed at in
its readout, beside its icon: the charts' values, a node's heartbeat, and what a
segment of a bar is of.

- A readout is at most two lines, so that it never makes the card's top row
  taller and moves nothing under the pointer.

- The measurement is in the color of the chart or the bar that is pointed
  at, and the rest is muted: the thing that it is of, its unit, its label and
  how long ago it was.

- Pointing at a segment of a bar names what the segment is of, over its
  amount and its share of the bar, as "queue 113cbdc3" over "12 messages,
  63%". A thing that has a name is named before its kind, as "payments
  application", and a thing that has only an ID by its kind and then the first
  part of its ID, as "queue 113cbdc3". The amount and the share are in
  the bar's color. A bar that has no shares, such as a handler's bar of the
  streams or queues that its instances are bound to, and a segment that
  merges the things that the bar has no room for, give the amount only, as
  "3 other queues" over "4 messages". A node whose workloads are unknown, while
  other nodes report theirs, is "node 113cbdc3" over "workloads unknown".
  The segment rises out of the bar while it is pointed at. Nothing opens, and
  an ID can't be copied from a bar.

  _Why: one place for what is pointed at on every card, which doesn't cover
  anything on the card; the trail in the title bar is where keys and IDs are
  copied._

- A handler's digest has its readout beside its kind icon, over the end of
  the handler's name, which keeps its size and fades out under the readout's
  left edge. The kind icon stays where it is. Its chart has a readout too, as
  a tile's does.

  _Why: a name that shortened as the readout came and went would make the digest
  jump._

- On a screen that is touched, a tap on a segment does what pointing does, and a
  tap on it again, or anywhere but the bar, ends it. A tap on a chart does what
  pointing at that place does, and a tap anywhere but the chart ends it. A tap
  on a bar or a chart of a card that is a link doesn't follow the link. A
  segment is a finger's height to tap. This holds while a segment leads nowhere;
  when segments drill down, it is to be decided again.

- A bar is described to assistive technology by the titles of its segments,
  and a readout is hidden from it, as the same figures are given as text.

## Icons

- A hovercard's icon is the icon of what the hovercard is about.

- A tile's icon is the entity of its vital signal, except the cluster tile,
  which has the cluster's icon.

- An icon follows Lucide's design guidelines, whether it comes from Lucide or
  not, and is as simple as the icons of the kinds of handler, with no badge.

  _Why: an overlaid badge was tried and was too complex at this size._

- The node's icon is the cluster's icon with one box filled.

## Adapting to the engine

How a part of a view looks depends on whether the engine supports what the part
shows, and on whether that is working now. There are three cases.

- **When the engine doesn't support what a part shows,** because every node
  declares it unsupported, such as the rate of events, the layout changes: the
  part is left out, a tile becomes another tile, or a chart becomes a sky.
  Nothing is wrong, so there is no alert flag. Only what the engine says that it
  supports changes the layout. What is working, connected or sending a signal at
  the moment never does.

- **When the engine supports what a part shows, but it isn't working now,** such
  as a rate whose samples have stopped arriving, a cluster with no node sending
  a signal, or a node that doesn't report what the others do, the layout stays the same. The
  numbers blur, and a number with no value at all is a blurred zero. While
  nothing reports, the bars are empty and the charts stop moving. The card's
  alert flag says what is wrong. This is the only case with an alert flag.

- **When what a part shows is working, but there is little to show,** such as
  only one stream so far, a node that owns no workloads, or a chart that has
  been at zero for the whole minute that it shows, the layout stays the same,
  and the numbers say so, with no alert flag. A chart that has been at zero for
  its whole minute is a sky, in the chart's color, until the chart's next value
  above zero; the chart then stays for at least a minute, until that value has
  scrolled out of it.

  _Why: a line along the bottom of a card shows nothing that the sky doesn't._

The moon's card says nothing about the card whose sky has the moon: it has the
moon's name, its phase tonight, a quote, and the status "There's nothing to
chart here, so here's a quote about the moon instead.", which is true of every
sky.

_Why: only one sky of a page has the moon, so whatever its card said would be
missing from every other sky._

A cluster supports everything that any of its nodes supports. A node that lacks
what another has is supported and not working for that thing. When the nodes
report their versions, the page shows that the versions differ, in the title
bar's trail, but it doesn't say why they differ, such as that a deploy is under
way.

_Why: the page shows "something here isn't current" for the whole of a deploy,
and never a figure that is silently too small. Showing only what every node
supports would hide the part for the whole of the usual deploy, which adds a
feature._

The coverage rule: how sure the page is of a figure, and how it shows it.

- A figure's **trust** is its freshness times its coverage. **Freshness** falls
  from 1 to 0 over the minute after its samples stop arriving. **Coverage** is
  the share of the cluster's nodes whose numbers it includes, for a metric that
  is summed across nodes. A member of the cluster with no signal counts
  as a node whose numbers it doesn't include, on every view.

- A figure that only some nodes report shows the sum from the nodes that do,
  not nothing. Its bars and charts stay live.

- The less a figure is trusted, the blurrier it is.

- A figure glitches briefly each time it loses trust in a step, rather than
  gradually, so it can glitch
  more than once, such as once for each node that stops: when coverage falls
  in a step, such as from all nodes to fewer, because a node stops reporting
  the metric or a node joins that doesn't; when the signal from every node
  stops; and when a stale figure expires. A gain in trust never glitches; the
  figure just sharpens.

  _Why: the blur shows how sure the page is, and the glitch shows the moment it
  became less sure, so that the reader looks. A glitch that lasted would wear
  out its meaning._

- A rate that isn't known only because a node's count is still being measured,
  as for a few seconds after the node joins the cluster or reconnects, stays as
  the last rate that was known, with no blur, no flag and no glitch, and moves
  to the new rate once the node has been measured. A rate that isn't known for
  any other reason loses its freshness as above, and a node being measured
  after that doesn't hold it.

  _Why: a node joining or reconnecting is routine, so it draws no attention; the
  last total is closer to the truth than leaving the node out._

- The page relies only on what the spec promises. When a design needs a
  promise that the spec doesn't make, the spec is amended, or the design is
  shown on `/review` only until it is.

## Look

- A component behaves the same wherever it appears, however many of it a
  view has, such as the failing count, which ramps down to "+0", stays, and
  shrinks away on a grid of a hundred compact digests as on the queues tile. A view
  that has too many of something for its behavior to work changes the
  component, for every view, rather than leaving the behavior out.

- Orange is for failing messages: the "+N" count after the count of
  messages, and the accent along the top of a tile or digest that has them.
  Red is for a judgment. The only one so far is that there is no signal: a
  figure such as the 0 of "0 cluster nodes" or "Offline", and the accent along
  the top of its tile or digest. Health Issues, when they come, are judgments
  too.

  _Why: a failing message is data, a count above zero, and not a judgment; red
  would read as a health Issue._

- A number whose part needs attention sets that part apart after it, as a
  smaller "+N" in the part's color.
  - Failing messages are set apart in orange: "24 +1" means 24 messages that are
    ready to be delivered now, and 1 more that is failing.
  - Applications and nodes with no signal are set apart in red: "94 +2" on the
    site view means 94 applications sending a signal and 2 more with none, and
    "4 +1" on the cluster tile means 4 nodes sending a signal and 1 more with
    none.
  - A "+N" is always added to the number on its left, to make the total: "24 +1"
    is 25 messages.
  - The explainer's annotation of a "+N" says what it counts, such as "the
    number of nodes with no signal".
  - When no member is sending a signal, there is nothing to set apart, so the
    number is a red zero alone, such as "0" on the cluster tile. A zero that
    isn't a judgment, such as no messages ready, isn't red.
  - Wherever a number counts messages that wait, it counts those that are ready
    to be delivered now, and the "+N" counts those that are failing. A command
    is ready as soon as it waits, so for commands the two add up to every
    command that waits. A deadline isn't ready until it is due.
  - When a "+N" first appears, it grows from nothing beside the number and
    glitches once. For a viewer who asks for less motion, it just appears.

  _Why: the glitch marks the moment that something starts to need attention, and
  the growing keeps the eye on the number for a reader who was looking at it._

- Every blurred number has a warning icon on its card whose tooltip says
  why, and each such status ends with "Numbers blur as they become less
  reliable." Every explainer ends with a footnote, under a thin line: "Numbers
  blur as they become less reliable. A warning icon nearby explains why." The
  one exception: while nothing on a view is sending a signal, the flag of the
  card that says so, such as the cluster tile's, speaks for the whole view. The
  parts under it, such as handler digests, have no flags or accents of their
  own, and their failing counts shrink away, so that the view shows one thing
  wrong, not several.

- How far a figure can be trusted is shown by blur and glitch, never by color.
  - A figure that can't be trusted at all is a blurred zero in its usual place,
    not words.
  - A figure is red only when it is itself the judgment, such as the 0 of "0
    cluster nodes".
  - "No signal" is shown by red words, or a red figure next to the number, and
    a red edge along the top of the card.
  - The cluster tile is the exception: its red top edge shows only when no
    node is sending a signal, because while some are, the cluster still works.

  _Why: one look for each meaning, so that a reader learns it once: blur means
  "how sure", orange means failing, red means no signal._

- On a card that leads to another page, only the thing's name is a link, and
  the card as a whole doesn't react to the pointer. While the name is pointed
  at or has the keyboard's focus, it is underlined and a chevron appears
  after it. On a screen that is touched, the chevron is always there, and a
  tap on the name or the kind follows the link.

  _Why: a screen that is touched can't point, so there the chevron is what says
  that a name leads elsewhere._

- A node's section of the heartbeat chart falls, in a straight line, from
  full when a heartbeat arrives to a third at the deadline of that
  heartbeat, which is when the node stops sending a signal, as the engine
  gives it. A node whose heartbeats give no way to tell when they expire
  stays full while it is connected. An application's section follows the
  latest deadline of its nodes.

  _Why: the deadline that the engine gives is the only one that the page relies
  on; the page adds no tolerance of its own._

- When a node stops sending a signal, its section of the heartbeat chart
  glitches once, for half a second: the glitch of a figure, turned on its
  side. The left and the right half of the section slip up and down on their
  own, once through the figure glitch's keyframes, with its red and cyan
  shadows. The slip and the shadows taper to nothing at the section's ends,
  so that the section stays joined to the line. The section then lingers
  for five seconds, in the gray of the flat line and without its shade,
  fading into the line's color just past its edges, as it falls from the
  level that it had to empty. Then its share shrinks away. A gone section
  can't be pointed at. When the last node has gone and lingered, the line
  settles to the height of the flat line. For a viewer who asks for less
  motion the section doesn't slip, and has only its shadows.

  _Why: a glitch marks the moment that something happens, and the headline drops
  at the same moment; the lingering section lets the reader see which node it
  was, and the gray says that it has gone._

- Pointing at a node's share of the heartbeat chart widens the line of the
  share from 1.5 to 4 pixels, over about 220 milliseconds, and narrows it
  again when the pointer leaves. The line is widest in the share and tapers
  back to its usual width just past the share's edges, and the shade under
  it is stronger by as much, so that the share has no border. The tile names
  the node beside its icon, where the sparklines' readouts are shown: "node
  3f8e2a10", in the muted color, over "heartbeat 4 s ago", or "heartbeat
  just now" within one and a half seconds, with the time in the tile's
  color. The engine tile's chart has one share, because the engine runs as
  one process, so its readout doesn't name it, and is only "heartbeat 4 s
  ago". On a screen
  that is touched, a tap on a share does the same, and doesn't follow the
  tile's link.

  _Why: the chart is drawn from every node, and pointing at it is how to tell
  which part is which node. The time is the measurement, so it has the tile's
  color, as a sparkline's readout shows its value._

- Pointing at a flag keeps the ordinary pointer, not the question mark of a
  help cursor.

- A page that has stopped being updated, because the Observatory can't be
  reached, has a red alert flag in its title bar, before the color mode
  control. It glitches as it appears, as a card's flag does, and its tooltip
  says "Updates have stopped arriving. This is the last data that arrived." A
  screen reader announces it.

  _Why: the page still shows the last data, and looks live, so the moment that
  it stops is marked where the eye goes, without moving the page._

- Every font face is a bundled `@fontsource` package. No system or CDN fonts.

- Every view has its own address. No scope switcher, no remembered "current"
  cluster.

- The title bar says where the page is as a trail that is the page's
  address: the site and the application, and the cluster or engine only on
  its own page. An application at no site has no site step. Its hovercard
  gives every step, the cluster or engine too, as a card's heading, with each
  key or ID to copy and each version as a tag. On a screen that is touched,
  a tap on the trail opens the hovercard, whose names are the links.

  _Why: a reader asks to see an application, not the cluster that a deploy can
  replace, and the keys need a place to be copied from that doesn't put them
  beside a name. A tap on the trail opens the hovercard, as an exception to the
  rule that a tap on a name follows its link, because otherwise a tap could
  never open it._

- A quote in another language shows a published translation with its
  translator, never one that was written for the page.

- The glitch effect is kept for what needs attention, in short bursts.

- The brand follows the Dogmatiq brand guide, in the dogmatiq/branding
  repository: the wordmark, its sizes and clear space, and its lockup with the
  product's name.

## Making the components enforce these rules

To do: a component library that makes the right design the easy one and a wrong
one awkward. There are no ideas for it yet.
