package observe_test

import (
	"context"
	"testing"
	"testing/synctest"
	"time"

	"github.com/dogmatiq/protobuf/enginegrpc"
	"github.com/dogmatiq/protobuf/metricsgrpc"
	"github.com/dogmatiq/protobuf/uuidpb"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/proto"

	. "github.com/dogmatiq/observatory/internal/observe"
)

const (
	queueFailing = "dogma.metrics.v1alpha1.QueueCommandsFailing"
	deadlineDue  = "dogma.metrics.v1alpha1.QueueDeadlinesDue"
)

func failing(queue *uuidpb.UUID, value uint64) proto.Message {
	return metricsgrpc.QueueCommandsFailing_builder{QueueId: queue, CurrentCount: value}.Build()
}

func due(queue *uuidpb.UUID, value uint64) proto.Message {
	return metricsgrpc.QueueCommandsDue_builder{QueueId: queue, CurrentCount: value}.Build()
}

func dueDeadlines(queue *uuidpb.UUID, value uint64) proto.Message {
	return metricsgrpc.QueueDeadlinesDue_builder{QueueId: queue, CurrentCount: value}.Build()
}

// liveNodes returns the set of live nodes that a node sends, which holds the
// nodes with the given IDs.
func liveNodes(ids ...*uuidpb.UUID) enginegrpc.WatchEngineResponse_builder {
	var nodes []*enginegrpc.ClusterNode
	for _, id := range ids {
		nodes = append(nodes, enginegrpc.ClusterNode_builder{Id: id}.Build())
	}
	return enginegrpc.WatchEngineResponse_builder{
		LiveClusterNodes: enginegrpc.LiveClusterNodes_builder{Nodes: nodes}.Build(),
	}
}

// workloads returns the set of workloads that a node sends, which holds the
// given number of workloads.
func workloads(n int) enginegrpc.WatchEngineResponse_builder {
	var owned []*enginegrpc.ClusterWorkload
	for range n {
		owned = append(owned, enginegrpc.ClusterWorkload_builder{Key: uuidpb.Generate()}.Build())
	}
	return enginegrpc.WatchEngineResponse_builder{
		ClusterWorkloads: enginegrpc.ClusterWorkloads_builder{Workloads: owned}.Build(),
	}
}

// found is a rule and the queue or node that it found an Issue with.
type found struct {
	Rule Rule
	ID   string
}

func issuesOf(issues []Issue) map[found]bool {
	got := map[found]bool{}
	for _, i := range issues {
		id := i.Queue
		if i.Node != nil {
			id = i.Node
		}
		got[found{i.Rule, id.AsString()}] = true
	}
	return got
}

func expectIssues(t testing.TB, issues []Issue, want ...found) {
	t.Helper()

	got := issuesOf(issues)
	if len(issues) != len(got) {
		t.Fatalf("unexpected duplicate issues: %v", issues)
	}
	if len(got) != len(want) {
		t.Fatalf("unexpected issues: got %v, want %v", got, want)
	}
	for _, w := range want {
		if !got[w] {
			t.Fatalf("missing issue: got %v, want %v", got, want)
		}
	}
}

func TestHealth(t *testing.T) {
	t.Run("func Assess()", func(t *testing.T) {
		t.Run("when a queue holds a message that failed", func(t *testing.T) {
			t.Run("it finds an issue for each queue, for commands and for deadlines", func(t *testing.T) {
				synctest.Test(t, func(t *testing.T) {
					ctx, cancel := context.WithCancel(t.Context())
					o, h := NewObserver(), NewHealth()
					cluster := uuidpb.Generate()
					a, b, c := uuidpb.Generate(), uuidpb.Generate(), uuidpb.Generate()

					n := startNode(t, ctx, o, cluster,
						queueFailing,
						"dogma.metrics.v1alpha1.QueueDeadlinesFailing",
					)
					n.sample(t, 0, "a", 1, failing(a, 2))
					n.sample(t, 0, "b", 1, failing(b, 0))
					n.sample(t, 1, "c", 1, metricsgrpc.QueueDeadlinesFailing_builder{QueueId: c, CurrentCount: 1}.Build())

					issues := h.Assess(time.Now(), o.Nodes())
					expectIssues(t, issues,
						found{FailedDeliveries, a.AsString()},
						found{FailedDeliveries, c.AsString()},
					)
					for _, i := range issues {
						if !i.Cluster.Equal(cluster) {
							t.Fatalf("unexpected cluster: got %s, want %s", i.Cluster, cluster)
						}
					}

					cancel()
					<-n.Engine.Done
				})
			})

			t.Run("it finds none once the messages are delivered", func(t *testing.T) {
				synctest.Test(t, func(t *testing.T) {
					ctx, cancel := context.WithCancel(t.Context())
					o, h := NewObserver(), NewHealth()
					a := uuidpb.Generate()

					n := startNode(t, ctx, o, uuidpb.Generate(), queueFailing)
					n.sample(t, 0, "a", 1, failing(a, 2))
					n.sample(t, 0, "a", 2, failing(a, 0))

					expectIssues(t, h.Assess(time.Now(), o.Nodes()))

					cancel()
					<-n.Engine.Done
				})
			})
		})

		t.Run("when a queue holds messages that are due", func(t *testing.T) {
			t.Run("it finds a backlog once the number hasn't fallen for five minutes", func(t *testing.T) {
				synctest.Test(t, func(t *testing.T) {
					ctx, cancel := context.WithCancel(t.Context())
					o, h := NewObserver(), NewHealth()
					a := uuidpb.Generate()

					n := startNode(t, ctx, o, uuidpb.Generate(), queueDue)
					n.sample(t, 0, "a", 1, due(a, 3))
					expectIssues(t, h.Assess(time.Now(), o.Nodes()))

					time.Sleep(5*time.Minute - time.Second)
					expectIssues(t, h.Assess(time.Now(), o.Nodes()))

					time.Sleep(time.Second)
					expectIssues(t, h.Assess(time.Now(), o.Nodes()), found{Backlog, a.AsString()})

					cancel()
					<-n.Engine.Done
				})
			})

			t.Run("it counts commands and deadlines together", func(t *testing.T) {
				synctest.Test(t, func(t *testing.T) {
					ctx, cancel := context.WithCancel(t.Context())
					o, h := NewObserver(), NewHealth()
					a := uuidpb.Generate()

					n := startNode(t, ctx, o, uuidpb.Generate(),
						queueDue,
						deadlineDue,
					)
					n.sample(t, 0, "a", 1, due(a, 3))
					n.sample(t, 1, "a", 1, dueDeadlines(a, 2))
					h.Assess(time.Now(), o.Nodes())

					// Commands fall by 3, and deadlines rise by 1: the total falls.
					time.Sleep(4 * time.Minute)
					n.sample(t, 0, "a", 2, due(a, 0))
					n.sample(t, 1, "a", 2, dueDeadlines(a, 3))
					h.Assess(time.Now(), o.Nodes())

					time.Sleep(4 * time.Minute)
					expectIssues(t, h.Assess(time.Now(), o.Nodes()))

					cancel()
					<-n.Engine.Done
				})
			})

			t.Run("it starts again when the number falls", func(t *testing.T) {
				synctest.Test(t, func(t *testing.T) {
					ctx, cancel := context.WithCancel(t.Context())
					o, h := NewObserver(), NewHealth()
					a := uuidpb.Generate()

					n := startNode(t, ctx, o, uuidpb.Generate(), queueDue)
					n.sample(t, 0, "a", 1, due(a, 3))
					h.Assess(time.Now(), o.Nodes())

					time.Sleep(4 * time.Minute)
					n.sample(t, 0, "a", 2, due(a, 2))
					h.Assess(time.Now(), o.Nodes())

					time.Sleep(4 * time.Minute)
					expectIssues(t, h.Assess(time.Now(), o.Nodes()))

					time.Sleep(time.Minute)
					expectIssues(t, h.Assess(time.Now(), o.Nodes()), found{Backlog, a.AsString()})

					cancel()
					<-n.Engine.Done
				})
			})

			t.Run("it doesn't start again when the number rises", func(t *testing.T) {
				synctest.Test(t, func(t *testing.T) {
					ctx, cancel := context.WithCancel(t.Context())
					o, h := NewObserver(), NewHealth()
					a := uuidpb.Generate()

					n := startNode(t, ctx, o, uuidpb.Generate(), queueDue)
					n.sample(t, 0, "a", 1, due(a, 3))
					h.Assess(time.Now(), o.Nodes())

					time.Sleep(4 * time.Minute)
					n.sample(t, 0, "a", 2, due(a, 9))
					h.Assess(time.Now(), o.Nodes())

					time.Sleep(time.Minute)
					expectIssues(t, h.Assess(time.Now(), o.Nodes()), found{Backlog, a.AsString()})

					cancel()
					<-n.Engine.Done
				})
			})

			t.Run("it starts again when none are due", func(t *testing.T) {
				synctest.Test(t, func(t *testing.T) {
					ctx, cancel := context.WithCancel(t.Context())
					o, h := NewObserver(), NewHealth()
					a := uuidpb.Generate()

					n := startNode(t, ctx, o, uuidpb.Generate(), queueDue)
					n.sample(t, 0, "a", 1, due(a, 3))
					h.Assess(time.Now(), o.Nodes())

					time.Sleep(4 * time.Minute)
					n.sample(t, 0, "a", 2, due(a, 0))
					h.Assess(time.Now(), o.Nodes())

					time.Sleep(time.Minute)
					n.sample(t, 0, "a", 3, due(a, 3))
					h.Assess(time.Now(), o.Nodes())

					time.Sleep(4 * time.Minute)
					expectIssues(t, h.Assess(time.Now(), o.Nodes()))

					cancel()
					<-n.Engine.Done
				})
			})

			t.Run("it starts again when no node reports the queue", func(t *testing.T) {
				synctest.Test(t, func(t *testing.T) {
					ctx, cancel := context.WithCancel(t.Context())
					o, h := NewObserver(), NewHealth()
					a := uuidpb.Generate()
					cluster := uuidpb.Generate()

					n := startNode(t, ctx, o, cluster, queueDue)
					n.sample(t, 0, "a", 1, due(a, 3))
					h.Assess(time.Now(), o.Nodes())

					time.Sleep(4 * time.Minute)
					n.Metrics.End(status.Error(codes.Unavailable, "no database"))
					synctest.Wait()
					h.Assess(time.Now(), o.Nodes())

					time.Sleep(5 * time.Second)
					n.Metrics = <-n.Engine.Calls
					n.sendPreamble(t, n.ID, cluster, queueDue)
					n.sample(t, 0, "a", 1, due(a, 3))
					h.Assess(time.Now(), o.Nodes())

					time.Sleep(time.Minute)
					expectIssues(t, h.Assess(time.Now(), o.Nodes()))

					cancel()
					<-n.Engine.Done
				})
			})

			t.Run("it keeps what it has seen of each cluster apart", func(t *testing.T) {
				synctest.Test(t, func(t *testing.T) {
					ctx, cancel := context.WithCancel(t.Context())
					o, h := NewObserver(), NewHealth()
					a := uuidpb.Generate()

					first := startNode(t, ctx, o, uuidpb.Generate(), queueDue)
					first.sample(t, 0, "a", 1, due(a, 3))
					h.Assess(time.Now(), o.Nodes())

					time.Sleep(4 * time.Minute)
					second := startNode(t, ctx, o, uuidpb.Generate(), queueDue)
					second.sample(t, 0, "a", 1, due(a, 3))
					h.Assess(time.Now(), o.Nodes())

					time.Sleep(time.Minute)
					issues := h.Assess(time.Now(), o.Nodes())
					if len(issues) != 1 || !issues[0].Cluster.Equal(byID(t, o, first.ID).Preamble.GetCluster().GetId()) {
						t.Fatalf("unexpected issues: %v", issues)
					}

					cancel()
					<-first.Engine.Done
					<-second.Engine.Done
				})
			})
		})

		t.Run("when the nodes of a cluster list the live nodes", func(t *testing.T) {
			t.Run("it finds an issue for a member that isn't reporting", func(t *testing.T) {
				synctest.Test(t, func(t *testing.T) {
					ctx, cancel := context.WithCancel(t.Context())
					o, h := NewObserver(), NewHealth()
					cluster := uuidpb.Generate()

					a := startNode(t, ctx, o, cluster)
					b := startNode(t, ctx, o, cluster)
					send(t, a.Engine, liveNodes(a.ID, b.ID))
					send(t, b.Engine, liveNodes(a.ID, b.ID))
					expectIssues(t, h.Assess(time.Now(), o.Nodes()))

					b.Engine.Feed.End(nil)
					<-b.Engine.Done
					synctest.Wait()

					expectIssues(t, h.Assess(time.Now(), o.Nodes()), found{Membership, b.ID.AsString()})

					cancel()
					<-a.Engine.Done
				})
			})

			t.Run("it finds an issue for a member that has never connected", func(t *testing.T) {
				synctest.Test(t, func(t *testing.T) {
					ctx, cancel := context.WithCancel(t.Context())
					o, h := NewObserver(), NewHealth()
					unseen := uuidpb.Generate()

					a := startNode(t, ctx, o, uuidpb.Generate())
					send(t, a.Engine, liveNodes(a.ID, unseen))

					expectIssues(t, h.Assess(time.Now(), o.Nodes()), found{Membership, unseen.AsString()})

					cancel()
					<-a.Engine.Done
				})
			})

			t.Run("it ignores the set of a node that has stopped reporting, while another node reports", func(t *testing.T) {
				synctest.Test(t, func(t *testing.T) {
					ctx, cancel := context.WithCancel(t.Context())
					o, h := NewObserver(), NewHealth()
					cluster := uuidpb.Generate()

					a := startNode(t, ctx, o, cluster)
					b := startNode(t, ctx, o, cluster)
					send(t, a.Engine, liveNodes(a.ID, b.ID))
					send(t, b.Engine, liveNodes(a.ID, b.ID))

					// b leaves, and a says so. b's own set still lists b.
					b.Engine.Feed.End(nil)
					<-b.Engine.Done
					send(t, a.Engine, liveNodes(a.ID))

					expectIssues(t, h.Assess(time.Now(), o.Nodes()))

					cancel()
					<-a.Engine.Done
				})
			})

			t.Run("it finds an issue for every node when none is reporting", func(t *testing.T) {
				synctest.Test(t, func(t *testing.T) {
					ctx := t.Context()
					o, h := NewObserver(), NewHealth()
					cluster := uuidpb.Generate()

					a := startNode(t, ctx, o, cluster)
					b := startNode(t, ctx, o, cluster)
					send(t, a.Engine, liveNodes(a.ID, b.ID))
					send(t, b.Engine, liveNodes(a.ID, b.ID))

					a.Engine.Feed.End(nil)
					b.Engine.Feed.End(nil)
					<-a.Engine.Done
					<-b.Engine.Done
					synctest.Wait()

					expectIssues(t, h.Assess(time.Now(), o.Nodes()),
						found{Membership, a.ID.AsString()},
						found{Membership, b.ID.AsString()},
					)
				})
			})

			t.Run("it finds an issue for a node whose heartbeat has expired", func(t *testing.T) {
				synctest.Test(t, func(t *testing.T) {
					ctx, cancel := context.WithCancel(t.Context())
					o, h := NewObserver(), NewHealth()
					cluster := uuidpb.Generate()

					a := startNode(t, ctx, o, cluster)
					b := startNode(t, ctx, o, cluster)
					send(t, a.Engine, liveNodes(a.ID, b.ID))
					send(t, b.Engine, heartbeat(10*time.Second))
					send(t, b.Engine, liveNodes(a.ID, b.ID))

					time.Sleep(11 * time.Second)

					expectIssues(t, h.Assess(time.Now(), o.Nodes()), found{Membership, b.ID.AsString()})

					cancel()
					<-a.Engine.Done
					<-b.Engine.Done
				})
			})
		})

		t.Run("it returns nothing when it knows no nodes", func(t *testing.T) {
			expectIssues(t, NewHealth().Assess(time.Now(), nil))
		})
	})
}
