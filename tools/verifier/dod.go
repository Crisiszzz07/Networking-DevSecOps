package main

import (
	"fmt"
	"regexp"
	"strings"
)

// Mirrors src/lib/dod.ts: same classification, same instrumentation, same
// markers — the web UI parses what this tool prints.

const Marker = "::lnet"

type LineKind int

const (
	Shebang LineKind = iota
	Preamble
	Check
	Pass
)

type DodLine struct {
	Kind    LineKind
	Source  string
	Check   int
	Warning string
}

var assignment = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*=`)

func ParseDod(script string) (lines []DodLine, checks int, passToken string) {
	for _, raw := range strings.Split(script, "\n") {
		t := strings.TrimSpace(raw)
		switch {
		case t == "":
		case strings.HasPrefix(t, "#!"):
			lines = append(lines, DodLine{Kind: Shebang, Source: t, Check: -1})
		case strings.HasPrefix(t, "set -") || assignment.MatchString(t):
			lines = append(lines, DodLine{Kind: Preamble, Source: t, Check: -1})
		case strings.HasPrefix(t, "echo PASS-"):
			passToken = strings.Trim(strings.TrimPrefix(t, "echo "), `"'`)
			lines = append(lines, DodLine{Kind: Pass, Source: t, Check: -1})
		default:
			l := DodLine{Kind: Check, Source: t, Check: checks}
			if strings.HasPrefix(t, "!") {
				l.Warning = "bajo set -e un comando negado con ! nunca aborta: en el script original este check no puede fallar"
			}
			lines = append(lines, l)
			checks++
		}
	}
	return
}

func Instrument(lines []DodLine, labID string) string {
	var b strings.Builder
	b.WriteString("#!/usr/bin/env bash\n# instrumentado por lnverify para " + labID + "\n")
	for _, l := range lines {
		switch l.Kind {
		case Preamble:
			if strings.HasPrefix(l.Source, "set ") {
				b.WriteString("set -uo pipefail\n")
			} else {
				b.WriteString(l.Source + "\n")
			}
		case Check:
			fmt.Fprintf(&b, "if { %s ; } >/dev/null 2>&1; then echo \"%s %s check %d pass\"; else echo \"%s %s check %d fail\"; fi\n",
				l.Source, Marker, labID, l.Check, Marker, labID, l.Check)
		}
	}
	fmt.Fprintf(&b, "echo \"%s %s done\"\n", Marker, labID)
	return b.String()
}

// ParseMarkers returns status per check: "pass", "fail" or "pending".
func ParseMarkers(out, labID string, n int) []string {
	st := make([]string, n)
	for i := range st {
		st[i] = "pending"
	}
	re := regexp.MustCompile(`^` + regexp.QuoteMeta(Marker) + ` (\S+) check (\d+) (pass|fail)$`)
	for _, line := range strings.Split(out, "\n") {
		m := re.FindStringSubmatch(strings.TrimSpace(line))
		if m == nil || m[1] != labID {
			continue
		}
		var i int
		fmt.Sscanf(m[2], "%d", &i)
		if i >= 0 && i < n {
			st[i] = m[3]
		}
	}
	return st
}
