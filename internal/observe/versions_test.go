package observe_test

import (
	"context"
	"testing"
	"testing/synctest"

	"github.com/dogmatiq/protobuf/enginegrpc"
	"github.com/dogmatiq/protobuf/uuidpb"

	. "github.com/dogmatiq/observatory/internal/observe"
)

func TestVersions(t *testing.T) {
	// versions starts a node of one cluster for each pair of engine and
	// application versions, and returns what the cluster's overview says of them.
	versions := func(t *testing.T, pairs ...[2]string) Versions {
		var got Versions
		synctest.Test(t, func(t *testing.T) {
			ctx, cancel := context.WithCancel(t.Context())
			defer cancel()

			o, r := NewObserver(), NewRecorder()
			c := uuidpb.Generate()

			for _, p := range pairs {
				app := appOf("statements", uuidpb.Generate())
				app.SetVersion(p[1])

				b := preamble(uuidpb.Generate(), c, 0)
				b.Preamble.SetImplementation(
					enginegrpc.WatchEngineResponse_Preamble_Implementation_builder{
						Name:    "engine",
						Version: p[0],
					}.Build(),
				)
				startEngine(t, ctx, o, b, app)
			}

			got = viewOf(t, r, o, c).Overview.Versions
		})
		return got
	}

	cases := []struct {
		Name  string
		Pairs [][2]string
		Want  Versions
	}{
		{
			Name:  "the same versions",
			Pairs: [][2]string{{"1.0.0", "a"}, {"1.0.0", "a"}},
			Want:  Versions{Engine: VersionsSame, Application: VersionsSame},
		},
		{
			Name:  "different engines",
			Pairs: [][2]string{{"1.0.0", "a"}, {"1.1.0", "a"}},
			Want:  Versions{Engine: VersionsDifferent, Application: VersionsSame},
		},
		{
			Name:  "different applications",
			Pairs: [][2]string{{"1.0.0", "a"}, {"1.0.0", "b"}},
			Want:  Versions{Engine: VersionsSame, Application: VersionsDifferent},
		},
		{
			Name:  "a version that a node doesn't give",
			Pairs: [][2]string{{"1.0.0", "a"}, {"", "a"}},
			Want:  Versions{Engine: VersionsUnknown, Application: VersionsSame},
		},
		{
			Name:  "different versions, and one that a node doesn't give",
			Pairs: [][2]string{{"1.0.0", "a"}, {"1.1.0", "a"}, {"", "a"}},
			Want:  Versions{Engine: VersionsDifferent, Application: VersionsSame},
		},
	}

	for _, tc := range cases {
		t.Run(tc.Name, func(t *testing.T) {
			if got := versions(t, tc.Pairs...); got != tc.Want {
				t.Fatalf("unexpected versions: got %+v, want %+v", got, tc.Want)
			}
		})
	}
}
