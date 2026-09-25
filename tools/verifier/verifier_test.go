package main

import (
	"bytes"
	"net"
	"os/exec"
	"strings"
	"testing"
	"time"
)

func mods(t *testing.T) []Module {
	t.Helper()
	dir, err := FindContentDir(".")
	if err != nil {
		t.Fatal(err)
	}
	m, err := LoadModules(dir)
	if err != nil {
		t.Fatal(err)
	}
	return m
}

func TestLoadsAllLabs(t *testing.T) {
	ms := mods(t)
	if len(ms) != 6 {
		t.Fatalf("want 6 modules, got %d", len(ms))
	}
	m, err := Find(ms, "1")
	if err != nil || m.LabID != "lab-01-tcp-pcap-state" {
		t.Fatalf("find 1: %v %q", err, m.LabID)
	}
	if !strings.Contains(m.Setup, "ip netns add ln1-client") {
		t.Fatalf("setup not extracted: %q", m.Setup)
	}
}

func TestDodMatchesWebEngine(t *testing.T) {
	m, _ := Find(mods(t), "lab-01-tcp-pcap-state")
	lines, n, token := ParseDod(m.DoD)
	if n != 3 || token != "PASS-lab-01" {
		t.Fatalf("n=%d token=%q", n, token)
	}
	if lines[len(lines)-2].Warning == "" {
		t.Fatal("negated check should carry a warning")
	}
}

func TestInstrumentedScriptReportsEachCheck(t *testing.T) {
	if _, err := exec.LookPath("bash"); err != nil {
		t.Skip("bash not available")
	}
	lines, n, _ := ParseDod("#!/usr/bin/env bash\nset -euo pipefail\nf=x\ntrue\nfalse\n! false\n[ \"$f\" = x ]\necho PASS-lab-99\n")
	out, _ := exec.Command("bash", "-c", Instrument(lines, "lab-99")).Output()
	got := ParseMarkers(string(out), "lab-99", n)
	want := []string{"pass", "fail", "pass", "pass"}
	if strings.Join(got, ",") != strings.Join(want, ",") {
		t.Fatalf("got %v want %v\n%s", got, want, out)
	}
}

func TestProbeClassifiesOpenAndRefused(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	addr := ln.Addr().String()
	if r := ProbeTCP(addr, time.Second); r.Verdict != "open" {
		t.Fatalf("open: %+v", r)
	}
	ln.Close()
	if r := ProbeTCP(addr, time.Second); r.Verdict != "refused" {
		t.Fatalf("refused: %+v", r)
	}
}

func TestCLIList(t *testing.T) {
	var out, errb bytes.Buffer
	if code := run([]string{"list"}, &out, &errb); code != 0 {
		t.Fatalf("exit %d: %s", code, errb.String())
	}
	if !strings.Contains(out.String(), "lab-06-policy-as-code") {
		t.Fatal(out.String())
	}
}
