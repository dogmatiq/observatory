package observe

import (
	"slices"
	"sync"
	"time"
)

// Trail is the recent history of one number, such as the number of events that
// a cluster records per minute. A view draws its sparkline from a Trail.
//
// A Trail keeps the values that were added in the last span, and forgets the
// older ones. It is safe to use from several goroutines.
type Trail struct {
	span time.Duration

	m      sync.Mutex
	points []TrailPoint
}

// TrailPoint is the value of a number at a moment.
type TrailPoint struct {
	At    time.Time
	Value float64
}

// NewTrail returns a Trail that is empty, and that keeps the values that were
// added in the last span.
func NewTrail(span time.Duration) *Trail {
	return &Trail{span: span}
}

// Add records that the number had the given value at the time at, and forgets
// the values from more than a span before at. Times that are added must not go
// backward.
func (t *Trail) Add(at time.Time, value float64) {
	t.m.Lock()
	defer t.m.Unlock()

	t.points = append(t.points, TrailPoint{at, value})

	for t.points[0].At.Before(at.Add(-t.span)) {
		t.points = t.points[1:]
	}
}

// Points returns the values that the Trail holds, oldest first.
func (t *Trail) Points() []TrailPoint {
	t.m.Lock()
	defer t.m.Unlock()

	return slices.Clone(t.points)
}
