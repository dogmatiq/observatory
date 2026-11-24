package observe

import (
	"cmp"
	"slices"
	"time"
)

// Installation is one application at one site, which is what the application
// view shows. An application whose nodes name no site has one installation, with
// no site.
//
// An installation is run by a cluster, or by an engine that doesn't run as a
// cluster. Usually one cluster runs it at a time, but there may be more, such as
// during a deploy that starts a new cluster beside the old one. An engine that
// doesn't run as a cluster has a new ID each time that it starts, so the
// Observer sees each run of it as a new cluster of the same installation.
type Installation struct {
	Application Application `json:"application"`

	// Site is nil for the installation of an application whose nodes name no
	// site.
	Site *Site `json:"site,omitempty"`
}

// installationKey identifies an installation by the keys of its site and its
// application. The site's key is "" for an installation with no site.
type installationKey struct {
	site, application string
}

// installation returns the installation that the cluster runs.
func (rec ClusterRecord) installation() Installation {
	return Installation{Application: rec.Application, Site: rec.Site}
}

// installationKey returns the key of the installation that the cluster runs.
func (rec ClusterRecord) installationKey() installationKey {
	k := installationKey{application: rec.Application.Key}
	if rec.Site != nil {
		k.site = rec.Site.Key
	}
	return k
}

// Installations returns every installation that the Observer has had a node of,
// sorted by the name of the application, then by its key, then by the name of
// the site, with no site first, then by its key. The names are those that the
// newest of the installation's clusters gives.
func (o *Observer) Installations() []Installation {
	o.m.Lock()
	defer o.m.Unlock()

	newest := map[installationKey]ClusterRecord{}
	for _, rec := range o.records {
		k := rec.installationKey()
		if n, ok := newest[k]; !ok || rec.seen > n.seen {
			newest[k] = rec
		}
	}

	out := make([]Installation, 0, len(newest))
	for _, rec := range newest {
		out = append(out, rec.installation())
	}

	slices.SortFunc(out, func(a, b Installation) int {
		return cmp.Or(
			cmp.Compare(a.Application.Name, b.Application.Name),
			cmp.Compare(a.Application.Key, b.Application.Key),
			compareSites(a.Site, b.Site),
		)
	})

	return out
}

// compareSites orders sites by name and then by key, with no site first.
func compareSites(a, b *Site) int {
	switch {
	case a == nil && b == nil:
		return 0
	case a == nil:
		return -1
	case b == nil:
		return 1
	}
	return cmp.Or(
		cmp.Compare(a.Name, b.Name),
		cmp.Compare(a.Key, b.Key),
	)
}

// ClustersOf returns the clusters that the Observer sees an installation
// through, at the time now, sorted by ID. The installation is that of the
// application whose key is application, at the site whose key is site, or with
// no site if site is "". The result is empty if the Observer has never had a
// node of the installation.
//
// The installation is seen through each of its clusters that has a node that is
// reporting, apart from one that has been replaced: none of its nodes is
// connected, and a cluster of the installation that the Observer began to
// remember after it has a node that is connected. This is what happens when an
// engine that doesn't run as a cluster restarts with a new ID, or a deploy
// replaces a cluster, while the old one's heartbeats have not yet expired.
//
// If that leaves no cluster, such as when none is reporting, it is seen through
// the cluster that the Observer began to remember last, which is down.
func (o *Observer) ClustersOf(now time.Time, site, application string) []ClusterSummary {
	o.m.Lock()
	defer o.m.Unlock()

	var out []ClusterSummary
	for _, c := range o.current(now) {
		if c.key == (installationKey{site, application}) {
			out = append(out, c.ClusterSummary)
		}
	}

	slices.SortFunc(out, func(a, b ClusterSummary) int {
		return cmp.Compare(a.ID, b.ID)
	})

	return out
}

// currentCluster is a cluster that the Observer sees an installation through,
// and the key of the installation.
type currentCluster struct {
	ClusterSummary
	key installationKey
}

// current returns every cluster that the Observer sees an installation
// through, at the time now, in no particular order. See [Observer.ClustersOf].
// o.m must be held.
func (o *Observer) current(now time.Time) []currentCluster {
	reporting := map[string]bool{}
	connected := map[string]bool{}
	for _, n := range o.snapshot() {
		id := clusterOf(n.Preamble)
		reporting[id] = reporting[id] || n.Reporting(now)
		connected[id] = connected[id] || n.Connected
	}

	byInstallation := map[installationKey][]ClusterRecord{}
	for _, rec := range o.records {
		k := rec.installationKey()
		byInstallation[k] = append(byInstallation[k], rec)
	}

	var out []currentCluster
	for k, recs := range byInstallation {
		// The newest cluster of the installation, and the order of the newest that
		// has a node that is connected, which is 0 if none has.
		newest := recs[0]
		var newestConnected uint64
		for _, rec := range recs {
			if rec.seen > newest.seen {
				newest = rec
			}
			if connected[rec.ID] {
				newestConnected = max(newestConnected, rec.seen)
			}
		}

		var running []ClusterRecord
		for _, rec := range recs {
			replaced := !connected[rec.ID] && rec.seen < newestConnected
			if reporting[rec.ID] && !replaced {
				running = append(running, rec)
			}
		}
		if len(running) == 0 {
			running = []ClusterRecord{newest}
		}

		for _, rec := range running {
			out = append(out, currentCluster{
				ID:          rec.ID,
				Application: rec.Application,
				Site:        rec.Site,
				Reporting:   reporting[rec.ID],
				key:         k,
			})
		}
	}

	return out
}
