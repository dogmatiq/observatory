package observe_test

import (
	"context"
	"fmt"
	"reflect"
	"testing"
	"testing/synctest"

	"github.com/dogmatiq/protobuf/enginegrpc"
	"github.com/dogmatiq/protobuf/uuidpb"

	. "github.com/dogmatiq/observatory/internal/observe"
)

func TestSoftware(t *testing.T) {
	// node is the software that one node of a cluster gives in its preamble.
	type node struct {
		Engine, EngineVersion, ApplicationVersion string
	}

	// software starts a node of one cluster for each of nodes, and returns what
	// the cluster's overview says of the software that they run.
	software := func(t *testing.T, nodes ...node) Software {
		var got Software
		synctest.Test(t, func(t *testing.T) {
			ctx, cancel := context.WithCancel(t.Context())
			defer cancel()

			o, r := NewObserver(), NewRecorder()
			c := uuidpb.Generate()

			for _, n := range nodes {
				app := appOf("statements", uuidpb.Generate())
				app.SetVersion(n.ApplicationVersion)

				b := preamble(uuidpb.Generate(), c, 0)
				b.Preamble.SetImplementation(
					enginegrpc.WatchEngineResponse_Preamble_Implementation_builder{
						Name:    n.Engine,
						Version: n.EngineVersion,
					}.Build(),
				)
				startEngine(t, ctx, o, b, app)
			}

			got = viewOf(t, r, o, c).Overview.Software
		})
		return got
	}

	cases := []struct {
		Name  string
		Nodes []node
		Want  Software
	}{
		{
			Name:  "every node gives the same software",
			Nodes: []node{{"runkit", "1.0.0", "a"}, {"runkit", "1.0.0", "a"}},
			Want: Software{
				EngineName:         "runkit",
				EngineVersions:     &VersionRange{Lowest: "1.0.0", Highest: "1.0.0"},
				ApplicationVersion: "a",
			},
		},
		{
			Name:  "different versions of the engine",
			Nodes: []node{{"runkit", "1.10.0", "a"}, {"runkit", "1.2.0", "a"}, {"runkit", "1.9.3", "a"}},
			Want: Software{
				EngineName:         "runkit",
				EngineVersions:     &VersionRange{Lowest: "1.2.0", Highest: "1.10.0"},
				ApplicationVersion: "a",
			},
		},
		{
			Name: "pre-releases, which come before their release",
			Nodes: []node{
				{"runkit", "2.0.0", "a"},
				{"runkit", "2.0.0-rc.10", "a"},
				{"runkit", "2.0.0-rc.2", "a"},
				{"runkit", "2.0.0-alpha", "a"},
				{"runkit", "2.0.0-alpha.1", "a"},
			},
			Want: Software{
				EngineName:         "runkit",
				EngineVersions:     &VersionRange{Lowest: "2.0.0-alpha", Highest: "2.0.0"},
				ApplicationVersion: "a",
			},
		},
		{
			Name:  "build metadata, which has no part in the order",
			Nodes: []node{{"runkit", "1.0.0+abc", "a"}, {"runkit", "1.0.1", "a"}},
			Want: Software{
				EngineName:         "runkit",
				EngineVersions:     &VersionRange{Lowest: "1.0.0+abc", Highest: "1.0.1"},
				ApplicationVersion: "a",
			},
		},
		{
			Name:  "different engines",
			Nodes: []node{{"runkit", "1.0.0", "a"}, {"veritas", "2.0.0", "a"}},
			Want:  Software{ApplicationVersion: "a"},
		},
		{
			Name:  "different versions of the application",
			Nodes: []node{{"runkit", "1.0.0", "a"}, {"runkit", "1.0.0", "b"}},
			Want: Software{
				EngineName:                "runkit",
				EngineVersions:            &VersionRange{Lowest: "1.0.0", Highest: "1.0.0"},
				ApplicationVersionsDiffer: true,
			},
		},
		{
			Name:  "versions that some nodes don't give",
			Nodes: []node{{"runkit", "1.0.0", "a"}, {"runkit", "", ""}},
			Want: Software{
				EngineName:         "runkit",
				EngineVersions:     &VersionRange{Lowest: "1.0.0", Highest: "1.0.0"},
				ApplicationVersion: "a",
			},
		},
		{
			Name:  "no versions at all",
			Nodes: []node{{"runkit", "", ""}},
			Want:  Software{EngineName: "runkit"},
		},
		{
			Name:  "an engine version that isn't a semantic version",
			Nodes: []node{{"runkit", "1.0", "a"}, {"runkit", "1.0.0", "a"}},
			Want: Software{
				EngineName:         "runkit",
				EngineVersions:     &VersionRange{Lowest: "1.0.0", Highest: "1.0.0"},
				ApplicationVersion: "a",
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.Name, func(t *testing.T) {
			if got := software(t, tc.Nodes...); !reflect.DeepEqual(got, tc.Want) {
				t.Fatalf("unexpected software: got %s, want %s", describe(got), describe(tc.Want))
			}
		})
	}
}

// describe returns the fields of sw as text, with the range of engine versions
// in place of its pointer.
func describe(sw Software) string {
	versions := "none"
	if r := sw.EngineVersions; r != nil {
		versions = r.Lowest + " to " + r.Highest
	}
	return fmt.Sprintf(
		"{engine %q, versions %s, application %q, differ %t}",
		sw.EngineName,
		versions,
		sw.ApplicationVersion,
		sw.ApplicationVersionsDiffer,
	)
}
