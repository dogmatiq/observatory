package observe_test

import (
	"testing"
	"time"

	. "github.com/dogmatiq/observatory/internal/observe"
)

func TestTrail(t *testing.T) {
	start := time.Date(2026, 11, 18, 12, 0, 0, 0, time.UTC)

	t.Run("func Add()", func(t *testing.T) {
		t.Run("it records the value and the time", func(t *testing.T) {
			tr := NewTrail(time.Minute)
			tr.Add(start, 1)
			tr.Add(start.Add(time.Second), 2)

			got := tr.Points()
			if len(got) != 2 || got[0].Value != 1 || got[1].Value != 2 {
				t.Fatalf("unexpected points: %v", got)
			}
			if !got[1].At.Equal(start.Add(time.Second)) {
				t.Fatalf("unexpected time: got %s", got[1].At)
			}
		})

		t.Run("it forgets values from more than a span before the latest", func(t *testing.T) {
			tr := NewTrail(time.Minute)
			tr.Add(start, 1)
			tr.Add(start.Add(30*time.Second), 2)
			tr.Add(start.Add(time.Minute), 3)
			tr.Add(start.Add(time.Minute+time.Second), 4)

			got := tr.Points()
			if len(got) != 3 || got[0].Value != 2 {
				t.Fatalf("unexpected points: %v", got)
			}
		})
	})

	t.Run("func Points()", func(t *testing.T) {
		t.Run("it returns the values oldest first", func(t *testing.T) {
			tr := NewTrail(time.Minute)
			tr.Add(start, 1)
			tr.Add(start.Add(time.Second), 2)

			got := tr.Points()
			if len(got) != 2 || got[0].Value != 1 || got[1].Value != 2 {
				t.Fatalf("unexpected points: %v", got)
			}
		})

		t.Run("it returns a copy", func(t *testing.T) {
			tr := NewTrail(time.Minute)
			tr.Add(start, 1)

			tr.Points()[0].Value = 99

			if got := tr.Points()[0].Value; got != 1 {
				t.Fatalf("unexpected value: got %g, want 1", got)
			}
		})

		t.Run("it returns nothing when nothing was added", func(t *testing.T) {
			if got := NewTrail(time.Minute).Points(); len(got) != 0 {
				t.Fatalf("unexpected points: %v", got)
			}
		})
	})
}
