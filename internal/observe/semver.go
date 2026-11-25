package observe

import (
	"slices"
	"strconv"
	"strings"
)

// semver is a version as Semantic Versioning 2.0.0 defines it
// (https://semver.org/spec/v2.0.0.html), which is how the spec says an engine
// gives the version of its software.
type semver struct {
	// text is the version as the engine gave it.
	text string

	major, minor, patch uint64

	// pre is the identifiers of the version's pre-release, if it has one.
	pre []string
}

// parseSemver returns the semantic version that text is, and false if it isn't
// one. Build metadata is ignored, as it has no part in precedence.
func parseSemver(text string) (semver, bool) {
	v := semver{text: text}

	core, _, _ := strings.Cut(text, "+")
	core, pre, hasPre := strings.Cut(core, "-")

	parts := strings.Split(core, ".")
	if len(parts) != 3 {
		return semver{}, false
	}

	nums := [3]*uint64{&v.major, &v.minor, &v.patch}
	for i, p := range parts {
		n, ok := numeric(p)
		if !ok {
			return semver{}, false
		}
		*nums[i] = n
	}

	if hasPre {
		v.pre = strings.Split(pre, ".")
		if slices.Contains(v.pre, "") {
			return semver{}, false
		}
	}

	return v, true
}

// numeric returns the number that s is, and false if it isn't a number in the
// form that Semantic Versioning allows, which has no leading zero.
func numeric(s string) (uint64, bool) {
	if s == "" || (len(s) > 1 && s[0] == '0') {
		return 0, false
	}
	for _, r := range s {
		if r < '0' || r > '9' {
			return 0, false
		}
	}
	n, err := strconv.ParseUint(s, 10, 64)
	return n, err == nil
}

// less returns true if v has lower precedence than w, by the rules of Semantic
// Versioning: the major, minor and patch versions in turn, then a pre-release
// before the release, and pre-releases identifier by identifier.
func (v semver) less(w semver) bool {
	if v.major != w.major {
		return v.major < w.major
	}
	if v.minor != w.minor {
		return v.minor < w.minor
	}
	if v.patch != w.patch {
		return v.patch < w.patch
	}

	// A version without a pre-release has higher precedence than one with.
	switch {
	case len(v.pre) == 0:
		return false
	case len(w.pre) == 0:
		return true
	}

	for i := 0; i < len(v.pre) && i < len(w.pre); i++ {
		a, b := v.pre[i], w.pre[i]
		if a == b {
			continue
		}

		an, aNum := numeric(a)
		bn, bNum := numeric(b)
		switch {
		case aNum && bNum:
			return an < bn
		case aNum:
			// A numeric identifier has lower precedence than one that isn't.
			return true
		case bNum:
			return false
		default:
			return a < b
		}
	}

	// A longer set of identifiers has higher precedence, if all before are equal.
	return len(v.pre) < len(w.pre)
}
