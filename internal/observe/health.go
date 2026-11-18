package observe

import (
	"maps"
	"slices"
	"time"

	"github.com/dogmatiq/protobuf/metricsgrpc"
	"github.com/dogmatiq/protobuf/uuidpb"
)

// backlogLimit is how long the number of due messages in a queue may go without
// falling, before the queue has a backlog.
const backlogLimit = 5 * time.Minute

// Rule is one of the checks that [Health] makes. Each finds one kind of
// [Issue].
type Rule int

const (
	// FailedDeliveries finds a queue that holds a message whose latest delivery
	// attempt failed.
	FailedDeliveries Rule = iota + 1

	// Backlog finds a queue that holds messages that are due, when the number of
	// them hasn't fallen for five minutes.
	Backlog

	// Membership finds a node that its cluster counts as a member, but that is
	// not reporting to the Observatory.
	Membership
)

// Issue is something that a health rule has found that needs a look, such as a
// queue with a message that keeps failing. A cluster is unhealthy when it has
// any Issue.
type Issue struct {
	// Cluster is the ID of the cluster that has the Issue.
	Cluster *uuidpb.UUID

	// Rule is the rule that found the Issue.
	Rule Rule

	// Queue is the ID of the queue that has the Issue. It is set for the rules
	// [FailedDeliveries] and [Backlog], and nil for the others.
	Queue *uuidpb.UUID

	// Node is the ID of the node that has the Issue. It is set for the rule
	// [Membership], and nil for the others.
	Node *uuidpb.UUID
}

// Health decides which [Issue]s the clusters have, by fixed rules, from what
// their nodes report. The engines send facts, and never say what is healthy.
//
// A Health remembers what it has seen, because the [Backlog] rule depends on
// how a queue changes over time. It is not safe for use by several goroutines.
type Health struct {
	// backlogs is, for each cluster and then each queue that holds due
	// messages, what the Backlog rule has seen of the queue.
	backlogs map[string]map[string]backlog
}

// backlog is what the Backlog rule has seen of one queue.
type backlog struct {
	// due is the number of messages that were due at the latest assessment.
	due uint64

	// since is the time of the assessment at which messages first became due, or
	// at which the number of them last fell, whichever was later.
	since time.Time
}

// NewHealth returns a Health that has seen nothing.
func NewHealth() *Health {
	return &Health{backlogs: map[string]map[string]backlog{}}
}

// Assess returns the Issues that the clusters of the given nodes have at the
// time now, in no particular order. The nodes are those that [Observer.Nodes]
// returns.
//
// Call it regularly: the Backlog rule sees a queue only at the times that it is
// called. It forgets a cluster that none of the nodes belong to.
func (h *Health) Assess(now time.Time, nodes []Node) []Issue {
	clusters := map[string][]Node{}
	for _, n := range nodes {
		id := n.Preamble.GetClusterId().AsString()
		clusters[id] = append(clusters[id], n)
	}

	for id := range h.backlogs {
		if _, ok := clusters[id]; !ok {
			delete(h.backlogs, id)
		}
	}

	var issues []Issue
	for id, members := range clusters {
		cluster := members[0].Preamble.GetClusterId()
		issues = append(issues, h.deliveries(now, cluster, members)...)
		issues = append(issues, h.backlog(now, id, cluster, members)...)
		issues = append(issues, membership(now, cluster, members)...)
	}

	return issues
}

// deliveries applies the FailedDeliveries rule to one cluster.
func (h *Health) deliveries(now time.Time, cluster *uuidpb.UUID, nodes []Node) []Issue {
	failing := map[string]*uuidpb.UUID{}

	for _, s := range Combine(now, nodes) {
		switch m := s.Message.(type) {
		case *metricsgrpc.QueueCommandsFailing:
			if m.GetValue() > 0 {
				failing[m.GetQueueId().AsString()] = m.GetQueueId()
			}
		case *metricsgrpc.QueueDeadlinesFailing:
			if m.GetValue() > 0 {
				failing[m.GetQueueId().AsString()] = m.GetQueueId()
			}
		}
	}

	var issues []Issue
	for _, queue := range failing {
		issues = append(issues, Issue{Cluster: cluster, Rule: FailedDeliveries, Queue: queue})
	}

	return issues
}

// backlog applies the Backlog rule to one cluster.
//
// A queue whose messages are no longer due, or that nodes no longer report,
// starts again if messages become due: without a report there is no knowing
// how the number has changed.
func (h *Health) backlog(now time.Time, id string, cluster *uuidpb.UUID, nodes []Node) []Issue {
	type queue struct {
		id  *uuidpb.UUID
		due uint64
	}
	queues := map[string]queue{}

	for _, s := range Combine(now, nodes) {
		switch m := s.Message.(type) {
		case *metricsgrpc.QueueCommandsDue:
			q := queues[m.GetQueueId().AsString()]
			queues[m.GetQueueId().AsString()] = queue{m.GetQueueId(), q.due + m.GetValue()}
		case *metricsgrpc.QueueDeadlinesDue:
			q := queues[m.GetQueueId().AsString()]
			queues[m.GetQueueId().AsString()] = queue{m.GetQueueId(), q.due + m.GetValue()}
		}
	}

	var (
		issues []Issue
		seen   = map[string]backlog{}
	)
	for key, q := range queues {
		if q.due == 0 {
			continue
		}

		b := backlog{due: q.due, since: now}
		if previous, ok := h.backlogs[id][key]; ok && q.due >= previous.due {
			b.since = previous.since
		}
		seen[key] = b

		if now.Sub(b.since) >= backlogLimit {
			issues = append(issues, Issue{Cluster: cluster, Rule: Backlog, Queue: q.id})
		}
	}

	h.backlogs[id] = seen

	return issues
}

// Members returns the IDs of the nodes that make up one cluster, at the time
// now, in no particular order. The nodes are all of the same cluster.
//
// The members are the nodes in the sets of live nodes that the cluster's nodes
// have sent. Only the sets of nodes that are reporting count, because the set of
// a node that has stopped reporting may list nodes that have left since. If no
// node is reporting, every node's set counts, so that a cluster that has
// stopped entirely still has members.
//
// A node that sent a set is also a member, whether or not its set lists it,
// because the Observatory has seen it.
func Members(now time.Time, nodes []Node) []*uuidpb.UUID {
	var sources []Node
	for _, n := range nodes {
		if n.Reporting(now) {
			sources = append(sources, n)
		}
	}
	if len(sources) == 0 {
		sources = nodes
	}

	members := map[string]*uuidpb.UUID{}
	for _, n := range sources {
		self := n.Preamble.GetNodeId()
		members[self.AsString()] = self
		for _, id := range n.LiveNodes.GetNodeIds() {
			members[id.AsString()] = id
		}
	}

	return slices.Collect(maps.Values(members))
}

// membership applies the Membership rule to one cluster. Each member that is
// not reporting is an Issue. See [Members].
func membership(now time.Time, cluster *uuidpb.UUID, nodes []Node) []Issue {
	reporting := map[string]bool{}
	for _, n := range nodes {
		if n.Reporting(now) {
			reporting[n.Preamble.GetNodeId().AsString()] = true
		}
	}

	var issues []Issue
	for _, id := range Members(now, nodes) {
		if !reporting[id.AsString()] {
			issues = append(issues, Issue{Cluster: cluster, Rule: Membership, Node: id})
		}
	}

	return issues
}
