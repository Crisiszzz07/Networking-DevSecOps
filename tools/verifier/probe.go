package main

import (
	"errors"
	"net"
	"os"
	"syscall"
	"time"
)

// ProbeResult classifies a TCP connect the way module 1 teaches: an RST proves
// the stack is reachable without a listener; a silent timeout is what a DROP
// looks like; ICMP unreachable points at routing.
type ProbeResult struct {
	Target  string `json:"target"`
	Verdict string `json:"verdict"`
	Meaning string `json:"meaning"`
	RTTms   int64  `json:"rtt_ms"`
	Error   string `json:"error,omitempty"`
}

func ProbeTCP(target string, timeout time.Duration) ProbeResult {
	start := time.Now()
	conn, err := net.DialTimeout("tcp", target, timeout)
	r := ProbeResult{Target: target, RTTms: time.Since(start).Milliseconds()}
	if err == nil {
		conn.Close()
		r.Verdict, r.Meaning = "open", "handshake completo: SYN → SYN-ACK → ACK; hay listener y la política lo permite"
		return r
	}
	r.Error = err.Error()
	var ne net.Error
	switch {
	case errors.Is(err, syscall.ECONNREFUSED):
		r.Verdict, r.Meaning = "refused", "llegó un RST: el host es alcanzable pero no hay listener (o un REJECT con tcp-reset)"
	case errors.Is(err, syscall.EHOSTUNREACH), errors.Is(err, syscall.ENETUNREACH):
		r.Verdict, r.Meaning = "unreachable", "ICMP unreachable o sin ruta: revisa la tabla de rutas o un REJECT con icmp"
	case errors.As(err, &ne) && ne.Timeout(), errors.Is(err, os.ErrDeadlineExceeded):
		r.Verdict, r.Meaning = "timeout", "sin respuesta: compatible con un DROP (SYN retransmitidos sin SYN-ACK)"
	default:
		r.Verdict, r.Meaning = "error", "fallo no clasificado"
	}
	return r
}
