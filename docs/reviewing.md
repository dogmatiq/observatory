# Reviewing a design

This document holds the rules for reviewing the design of the Observatory's
pages with its owner, on the review page, `/-/review`. The page is a tool for
that review, and isn't part of the product. A skill for running such a review is
to be written from these rules.

Every part that is being worked on is shown on the review page, in every state
that it can be in, because a demo reaches the unusual states only by chance.

- Each tile is shown whole first, in each state that it can be in. Then each of
  its parts is shown on its own, in this order: its icon, its big number, the
  line under that, its bar and its chart, each as it looks when pointed at.

- If a hovercard's words are the same in every state, and only some states add
  a status to it, it is shown once, with the status.

- Each tile, part, state and alternative has an ID, in full and copyable, such
  as "CL", "CL 4", "CL 4A" and "CL 4A1".

- Each part that has anything open says, under "Not decided here", what it
  shows that isn't being decided in it, and where that is decided instead,
  even when it is drawn. The review page's types make this impossible to
  leave out.

  _Why: a reviewer otherwise judges everything that is drawn, and can't tell
  which of it a decision covers._

- Each part or state is marked decided or under review, and what is under
  review has a recommendation with an Accept button.

- Other wordings or designs are alternatives to the state that they would
  replace, in a frame below the part's states. The state shows the
  recommended one; accepting the state or one alternative is one decision.

- An acceptance can be undone, which puts the thing under review again. The
  decisions file is a log, and each ID's last entry counts.

- Each tile, part and state can be collapsed to its heading. One that is
  fully decided is collapsed, from when the page opens or as soon as its
  last decision is made, until the reviewer opens it to see it or undo an
  acceptance; after the reviewer opens or closes it, it stays as they left
  it.

- An acceptance is withdrawn if what was accepted changes afterwards, so
  that nothing is settled in a form the reviewer hasn't seen.

- A part that is settled, which is decided and built, leaves the page. A part
  that is decided and not yet built stays, collapsed, so that its acceptance can
  still be undone.

- The page is in the order in which its open decisions depend on each
  other, across all of its tiles: what is open about a layout first, then
  about states, then about words, then about details, such as bars and
  charts. It is not in the order in which things
  were added.

  _Why: a decision about a layout can undo one about words, and never the other
  way round._

- A chunk is about the size of one sitting: one part, with about five
  states and one set of alternatives, as the site view's states chunk (SS)
  was. A chunk that would be bigger is split.

- The page shows one open part at a time, across every tile: the parts
  before it are settled and collapsed, and the page names the parts and
  tiles still to come.

  _Why: a page with every open part on it was too much to review._

- A state about words quotes the words of its equivalent elsewhere, such
  as on the cluster view, below what it shows, and says whether those words
  are settled or still under review, and where.

  _Why: the reviewer judges new words against the words already chosen, without
  having to go and find them._
