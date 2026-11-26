package observe

import (
	"cmp"
	"slices"
	"time"
)

// SiteView is everything that the site view of one site shows: the totals of
// the applications at the site, as three tiles, and each application.
//
// It is made from the cluster views of the clusters that each application at the
// site is seen through, as [Observer.ClustersOf] gives them, so that the site
// view counts what the cluster views count, in the same way. An application that
// runs as several clusters at the site, such as during a blue/green deploy, is
// one application, whose figures are the sums of its clusters'.
//
// Only clusters that have a node reporting add to the figures, because a cluster
// that is down shows what it showed when a node last reported, which is not
// current. Its nodes still count toward the coverage of the totals, as nodes that
// don't report.
type SiteView struct {
	// Site is the site. It is nil for the applications at no site.
	Site *Site `json:"site,omitempty"`

	// Events is the events tile. It is nil if no application's engine supports
	// the length of event streams or the metrics that the rate of events is
	// derived from.
	Events *SiteEvents `json:"events,omitempty"`

	// Queues is the queues tile. It is nil if no application's engine supports
	// the number of messages in queues or the metrics that the rate of their
	// removal is derived from.
	Queues *SiteQueues `json:"queues,omitempty"`

	// Applications is each application at the site, by name, then by key.
	Applications []SiteApplication `json:"applications"`
}

// SiteEvents is the events tile of a site.
type SiteEvents struct {
	// Rate is how many events per second the applications record together. It
	// is nil if no application's engine supports the metrics that it is derived
	// from.
	Rate *Rate `json:"rate,omitempty"`

	// Streams is the event streams of the applications together. It is nil if no
	// application's engine supports the length of event streams.
	Streams *StreamCount `json:"streams,omitempty"`

	// Coverage is the share of the nodes at the site that report the tile's
	// metrics, if it is less than all of them. See [SiteView].
	Coverage *float64 `json:"coverage,omitempty"`
}

// SiteQueues is the queues tile of a site.
type SiteQueues struct {
	// Messages is the number of messages in the applications' queues that are
	// ready to be delivered now, as [QueuesTile.Queues] counts them.
	Messages uint64 `json:"messages"`

	// Queues is the number of the applications' queues. It is nil if no
	// application's engine supports the number of messages in queues.
	Queues *int `json:"queues,omitempty"`

	// Failing is the number of messages whose latest delivery attempt failed.
	Failing uint64 `json:"failing"`

	// Throughput is how many messages per second the applications' queues get
	// through together. It is nil if no application's engine supports it.
	Throughput *Rate `json:"throughput,omitempty"`

	// Coverage is the share of the nodes at the site that report the tile's
	// metrics, if it is less than all of them. See [SiteView].
	Coverage *float64 `json:"coverage,omitempty"`
}

// StreamCount is some event streams: how many there are, and how many events
// they hold together.
type StreamCount struct {
	Count  int    `json:"count"`
	Events uint64 `json:"events"`
}

// SiteApplication is what the site view shows of one application at the site.
type SiteApplication struct {
	Application Application `json:"application"`

	// Members is the nodes of every cluster that the application is seen
	// through, as [ClusterView] has them, sorted by ID. The application is
	// sending a signal while any of them is reporting.
	Members []Member `json:"members"`

	// Coverage is the lowest share of the application's nodes that report the
	// metrics of its figures, if it is less than all of them.
	Coverage *float64 `json:"coverage,omitempty"`

	// Events is the application's events, if its engine supports them.
	Events *ApplicationEvents `json:"events,omitempty"`

	// Queues is the application's messages in queues, if its engine supports
	// them.
	Queues *ApplicationQueues `json:"queues,omitempty"`
}

// ApplicationEvents is the events of one application at a site.
type ApplicationEvents struct {
	// Rate is how many events per second the application records. It is nil if
	// its engine doesn't support the metrics that it is derived from.
	Rate *Rate `json:"rate,omitempty"`

	// Streams is the application's event streams. It is nil if its engine
	// doesn't support the length of event streams.
	Streams *StreamCount `json:"streams,omitempty"`
}

// ApplicationQueues is the messages in the queues of one application at a site.
type ApplicationQueues struct {
	// Messages is the number of messages that are ready to be delivered now.
	Messages uint64 `json:"messages"`

	// Failing is the number of messages whose latest delivery attempt failed.
	Failing uint64 `json:"failing"`

	// Queues is the number of the application's queues. It is nil if its engine
	// doesn't support the number of messages in queues.
	Queues *int `json:"queues,omitempty"`
}

// SiteViewOf returns the site view of a site, given the cluster views of the
// clusters that each application at the site is seen through, one slice for
// each application.
func SiteViewOf(site *Site, applications [][]ClusterView) SiteView {
	v := SiteView{Site: site, Applications: []SiteApplication{}}

	var (
		events, queues                       *tally
		eventRates, throughputs              []*Rate
		eventsHaveRate, queuesHaveThroughput bool
	)

	for _, views := range applications {
		if len(views) == 0 {
			continue
		}

		app := SiteApplication{Application: views[0].Application, Members: []Member{}}
		var appRates []*Rate
		appHasRate := false
		var appCoverage tally

		for _, view := range views {
			o := view.Overview
			members := membersOfOverview(o)
			app.Members = append(app.Members, members...)

			// A cluster that is down has no member to count, but its application
			// has at least one node, which doesn't report.
			n := max(len(members), 1)
			live := !view.Down
			e, q := o.Events, o.Queues

			if e != nil {
				if events == nil {
					events = &tally{}
				}
				if app.Events == nil {
					app.Events = &ApplicationEvents{}
				}
				if e.Rate != nil {
					eventsHaveRate, appHasRate = true, true
					if live {
						eventRates = append(eventRates, e.Rate)
						appRates = append(appRates, e.Rate)
					}
				}
				if live && e.Streams != nil {
					app.Events.Streams = addStreams(app.Events.Streams, e.Streams)
				}
			}

			if q != nil {
				if queues == nil {
					queues = &tally{}
				}
				if app.Queues == nil {
					app.Queues = &ApplicationQueues{}
				}
				if q.Throughput != nil {
					queuesHaveThroughput = true
					if live {
						throughputs = append(throughputs, q.Throughput)
					}
				}
				if live {
					for _, s := range q.Queues {
						app.Queues.Messages += s.Size
					}
					app.Queues.Failing += q.Failing
					if q.Queues != nil {
						app.Queues.Queues = addCount(app.Queues.Queues, len(q.Queues))
					}
				}
			}

			// A tile's coverage counts every cluster at the site, and the
			// application's counts its own, each weighted by its nodes. A cluster
			// that is down, or doesn't support the tile, has no node that reports.
			own := func(supported bool, c *float64) float64 {
				switch {
				case !live || !supported:
					return 0
				case c == nil:
					return 1
				default:
					return *c
				}
			}
			var ec, qc *float64
			if e != nil {
				ec = e.Coverage
			}
			if q != nil {
				qc = q.Coverage
			}
			if events != nil {
				events.add(n, own(e != nil, ec))
			}
			if queues != nil {
				queues.add(n, own(q != nil, qc))
			}

			// The application's figures are as trusted as the least trusted of
			// them.
			c := 1.0
			if e != nil {
				c = min(c, own(true, ec))
			}
			if q != nil {
				c = min(c, own(true, qc))
			}
			if !live {
				c = 0
			}
			appCoverage.add(n, c)
		}

		// A rate that only clusters that are down have is unknown.
		if appHasRate {
			app.Events.Rate = &Rate{}
			if len(appRates) > 0 {
				app.Events.Rate = sumRates(appRates)
			}
		}
		app.Coverage = appCoverage.share()

		slices.SortFunc(app.Members, func(a, b Member) int { return cmp.Compare(a.ID, b.ID) })
		v.Applications = append(v.Applications, app)
	}

	if events != nil {
		v.Events = &SiteEvents{Coverage: events.share()}
		if eventsHaveRate {
			v.Events.Rate = sumRates(eventRates)
		}
	}
	if queues != nil {
		v.Queues = &SiteQueues{Coverage: queues.share()}
		if queuesHaveThroughput {
			v.Queues.Throughput = sumRates(throughputs)
		}
	}

	for _, a := range v.Applications {
		if e := a.Events; e != nil && e.Streams != nil {
			v.Events.Streams = addStreamCount(v.Events.Streams, *e.Streams)
		}
		if q := a.Queues; q != nil {
			v.Queues.Messages += q.Messages
			v.Queues.Failing += q.Failing
			if q.Queues != nil {
				v.Queues.Queues = addCount(v.Queues.Queues, *q.Queues)
			}
		}
	}

	slices.SortFunc(v.Applications, func(a, b SiteApplication) int {
		return cmp.Or(
			cmp.Compare(a.Application.Name, b.Application.Name),
			cmp.Compare(a.Application.Key, b.Application.Key),
		)
	})

	return v
}

// membersOfOverview returns the members of a cluster, or its engine while it is
// reporting, as the overview has them.
func membersOfOverview(o Overview) []Member {
	switch {
	case o.Cluster != nil:
		return o.Cluster.Nodes
	case o.Engine != nil && o.Engine.Node != nil:
		return []Member{*o.Engine.Node}
	default:
		return nil
	}
}

// tally is the share of some nodes that report the metrics of a figure, added
// up one cluster at a time.
type tally struct {
	reporting float64
	nodes     int
}

// add counts a cluster of n nodes, of which the given share report.
func (t *tally) add(n int, share float64) {
	t.reporting += share * float64(n)
	t.nodes += n
}

// share returns the share of the nodes that report, or nil if all of them do.
func (t tally) share() *float64 {
	if t.nodes == 0 || t.reporting >= float64(t.nodes) {
		return nil
	}
	v := t.reporting / float64(t.nodes)
	return &v
}

// sumRates returns the sum of some rates. The sum is known only if there is at
// least one rate and each of them is known. It is measuring if every rate that
// isn't known is measuring.
func sumRates(rates []*Rate) *Rate {
	// With none to add, as when every cluster that has the rate is down, it
	// isn't known.
	if len(rates) == 0 {
		return &Rate{}
	}

	var sum float64
	measuring := false
	for _, r := range rates {
		switch {
		case r.PerSecond != nil:
			sum += *r.PerSecond
		case r.Measuring:
			measuring = true
		default:
			return &Rate{}
		}
	}
	if measuring {
		return &Rate{Measuring: true}
	}
	return &Rate{PerSecond: &sum}
}

// addStreams returns the streams of c together with those in s.
func addStreams(c *StreamCount, s []Spread) *StreamCount {
	if c == nil {
		c = &StreamCount{}
	}
	c.Count += len(s)
	for _, x := range s {
		c.Events += x.Size
	}
	return c
}

// addStreamCount returns the streams of c together with s.
func addStreamCount(c *StreamCount, s StreamCount) *StreamCount {
	if c == nil {
		c = &StreamCount{}
	}
	c.Count += s.Count
	c.Events += s.Events
	return c
}

// addCount returns the number that c points to, or zero, plus n.
func addCount(c *int, n int) *int {
	v := n
	if c != nil {
		v += *c
	}
	return &v
}

// SiteSeries returns what the charts of the site view have recorded: the sums,
// at each moment, of what those of the given clusters have.
func (r *Recorder) SiteSeries(clusters []string) Series {
	events := map[time.Time]float64{}
	throughput := map[time.Time]float64{}

	for _, id := range clusters {
		s := r.Series(id)
		for _, p := range s.Events {
			events[p.At] += p.Value
		}
		for _, p := range s.Throughput {
			throughput[p.At] += p.Value
		}
	}

	return Series{
		Events:     sortedPoints(events),
		Throughput: sortedPoints(throughput),
		Handlers:   map[string][]TrailPoint{},
	}
}

// sortedPoints returns the points of a series, oldest first.
func sortedPoints(values map[time.Time]float64) []TrailPoint {
	points := make([]TrailPoint, 0, len(values))
	for at, v := range values {
		points = append(points, TrailPoint{at, v})
	}
	slices.SortFunc(points, func(a, b TrailPoint) int { return a.At.Compare(b.At) })
	return points
}
