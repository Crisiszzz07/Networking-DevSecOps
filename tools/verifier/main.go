// lnverify — local companion for the Redes para DevSecOps labs.
//
//	lnverify list                         labs found in content/modules
//	lnverify show <lab> [setup|dod]       print a lab script
//	lnverify instrument <lab>             DoD script with one marker per check
//	lnverify run <lab> [--json] [--dir D] run every DoD check, report each one
//	lnverify probe tcp <host:port>        open / refused (RST) / timeout (DROP) / unreachable
//	lnverify tls <host:port> [flags]      handshake, chain, SANs, expiry, verification
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strings"
	"time"
)

func main() {
	os.Exit(run(os.Args[1:], os.Stdout, os.Stderr))
}

func usage(w io.Writer) {
	fmt.Fprintln(w, `uso: lnverify [--content DIR] <comando>

  list                          labs en content/modules
  show <lab> [setup|dod]        imprime el script del lab (por defecto: dod)
  instrument <lab>              script DoD instrumentado (un marcador ::lnet por check)
  run <lab> [--json] [--dir D] [--timeout 60s]
                                ejecuta cada check del DoD y reporta el estado de cada uno
  probe tcp <host:port> [--timeout 3s] [--json]
                                clasifica la conexión: open, refused (RST), timeout (DROP), unreachable
  tls <host:port> [--servername N] [--ca F] [--cert F --key F] [--json]
                                inspecciona el handshake TLS y la cadena de certificados

<lab> admite lab-01-tcp-pcap-state, modulo-01, el slug o simplemente 1.`)
}

func run(args []string, stdout, stderr io.Writer) int {
	global := flag.NewFlagSet("lnverify", flag.ContinueOnError)
	global.SetOutput(stderr)
	contentDir := global.String("content", "", "directorio content/modules (por defecto se busca hacia arriba)")
	global.Usage = func() { usage(stderr) }
	if err := global.Parse(args); err != nil {
		return 2
	}
	rest := global.Args()
	if len(rest) == 0 {
		usage(stderr)
		return 2
	}

	loadMods := func() ([]Module, error) {
		dir := *contentDir
		if dir == "" {
			wd, _ := os.Getwd()
			d, err := FindContentDir(wd)
			if err != nil {
				return nil, err
			}
			dir = d
		}
		return LoadModules(dir)
	}
	fail := func(err error) int {
		fmt.Fprintln(stderr, "lnverify:", err)
		return 1
	}

	switch cmd, sub := rest[0], rest[1:]; cmd {
	case "list":
		mods, err := loadMods()
		if err != nil {
			return fail(err)
		}
		for _, m := range mods {
			_, n, _ := ParseDod(m.DoD)
			fmt.Fprintf(stdout, "%-10s %-28s %d checks  %s\n", m.ID, m.LabID, n, m.Title)
		}
		return 0

	case "show", "instrument":
		if len(sub) == 0 {
			return fail(fmt.Errorf("%s necesita un lab", cmd))
		}
		mods, err := loadMods()
		if err != nil {
			return fail(err)
		}
		m, err := Find(mods, sub[0])
		if err != nil {
			return fail(err)
		}
		if cmd == "instrument" {
			lines, _, _ := ParseDod(m.DoD)
			fmt.Fprint(stdout, Instrument(lines, m.LabID))
			return 0
		}
		if len(sub) > 1 && sub[1] == "setup" {
			fmt.Fprint(stdout, m.Setup)
		} else {
			fmt.Fprint(stdout, m.DoD)
		}
		return 0

	case "run":
		fs := flag.NewFlagSet("run", flag.ContinueOnError)
		fs.SetOutput(stderr)
		asJSON := fs.Bool("json", false, "salida JSON (pegable en la pestaña Auditoría)")
		dir := fs.String("dir", ".", "directorio de trabajo (los labs 03, 05 y 06 usan rutas relativas .lab-0N)")
		timeout := fs.Duration("timeout", 60*time.Second, "tiempo máximo del script")
		lab, flagArgs := splitPositional(sub)
		if err := fs.Parse(flagArgs); err != nil || lab == "" {
			return fail(fmt.Errorf("uso: lnverify run <lab> [--json] [--dir D]"))
		}
		mods, err := loadMods()
		if err != nil {
			return fail(err)
		}
		m, err := Find(mods, lab)
		if err != nil {
			return fail(err)
		}
		return runDod(m, *dir, *timeout, *asJSON, stdout, stderr)

	case "probe":
		fs := flag.NewFlagSet("probe", flag.ContinueOnError)
		fs.SetOutput(stderr)
		timeout := fs.Duration("timeout", 3*time.Second, "espera máxima del SYN-ACK")
		asJSON := fs.Bool("json", false, "salida JSON")
		pos, flagArgs := splitAllPositional(sub)
		if err := fs.Parse(flagArgs); err != nil || len(pos) != 2 || pos[0] != "tcp" {
			return fail(fmt.Errorf("uso: lnverify probe tcp <host:port>"))
		}
		r := ProbeTCP(pos[1], *timeout)
		if *asJSON {
			return emitJSON(stdout, r, r.Verdict == "open")
		}
		fmt.Fprintf(stdout, "%s  %s  (%d ms)\n  %s\n", r.Target, strings.ToUpper(r.Verdict), r.RTTms, r.Meaning)
		if r.Verdict != "open" {
			return 1
		}
		return 0

	case "tls":
		fs := flag.NewFlagSet("tls", flag.ContinueOnError)
		fs.SetOutput(stderr)
		sni := fs.String("servername", "", "SNI y nombre a validar (por defecto el host)")
		ca := fs.String("ca", "", "trust anchor PEM (por defecto el almacén del sistema)")
		cert := fs.String("cert", "", "certificado cliente PEM (mTLS)")
		key := fs.String("key", "", "clave del certificado cliente")
		timeout := fs.Duration("timeout", 5*time.Second, "timeout de conexión")
		asJSON := fs.Bool("json", false, "salida JSON")
		target, flagArgs := splitPositional(sub)
		if err := fs.Parse(flagArgs); err != nil || target == "" {
			return fail(fmt.Errorf("uso: lnverify tls <host:port> [--servername N] [--ca F] [--cert F --key F]"))
		}
		rep, err := ScanTLS(target, *sni, *ca, *cert, *key, *timeout)
		if err != nil {
			return fail(err)
		}
		if *asJSON {
			return emitJSON(stdout, rep, rep.Verified)
		}
		printTLS(stdout, rep)
		if !rep.Verified {
			return 1
		}
		return 0

	case "help", "-h", "--help":
		usage(stdout)
		return 0
	}
	usage(stderr)
	return 2
}

// splitPositional pulls the first non-flag argument so flags may come before or after it.
func splitPositional(args []string) (string, []string) {
	pos, rest := splitAllPositional(args)
	if len(pos) == 0 {
		return "", rest
	}
	return pos[0], append(rest, pos[1:]...)
}

func splitAllPositional(args []string) (pos, flags []string) {
	for i := 0; i < len(args); i++ {
		a := args[i]
		if strings.HasPrefix(a, "-") {
			flags = append(flags, a)
			if !strings.Contains(a, "=") && i+1 < len(args) && !strings.HasPrefix(args[i+1], "-") && !isBoolFlag(a) {
				flags = append(flags, args[i+1])
				i++
			}
			continue
		}
		pos = append(pos, a)
	}
	return
}

func isBoolFlag(a string) bool {
	return strings.TrimLeft(a, "-") == "json"
}

type checkReport struct {
	Index   int    `json:"index"`
	Command string `json:"command"`
	Status  string `json:"status"`
	Warning string `json:"warning,omitempty"`
}

type runReport struct {
	Lab       string        `json:"lab"`
	Pass      bool          `json:"pass"`
	PassToken string        `json:"pass_token"`
	Checks    []checkReport `json:"checks"`
	Ran       string        `json:"ran_at"`
}

func runDod(m Module, dir string, timeout time.Duration, asJSON bool, stdout, stderr io.Writer) int {
	lines, n, token := ParseDod(m.DoD)
	script := Instrument(lines, m.LabID)
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, "bash", "-c", script)
	cmd.Dir = dir
	out, err := cmd.Output()
	if ctx.Err() != nil {
		fmt.Fprintln(stderr, "lnverify: el script superó el timeout")
	} else if err != nil && len(out) == 0 {
		fmt.Fprintln(stderr, "lnverify:", err)
	}
	status := ParseMarkers(string(out), m.LabID, n)
	rep := runReport{Lab: m.LabID, Pass: true, PassToken: token, Ran: time.Now().UTC().Format(time.RFC3339)}
	for _, l := range lines {
		if l.Kind != Check {
			continue
		}
		s := status[l.Check]
		if s != "pass" {
			rep.Pass = false
		}
		rep.Checks = append(rep.Checks, checkReport{Index: l.Check, Command: l.Source, Status: s, Warning: l.Warning})
	}
	if asJSON {
		return emitJSON(stdout, rep, rep.Pass)
	}
	for _, c := range rep.Checks {
		fmt.Fprintf(stdout, "%s %s check %d %s\n", Marker, m.LabID, c.Index, c.Status)
	}
	for _, c := range rep.Checks {
		glyph := map[string]string{"pass": "✓", "fail": "✗", "pending": "?"}[c.Status]
		fmt.Fprintf(stderr, "  %s %d  %s\n", glyph, c.Index+1, c.Command)
		if c.Warning != "" {
			fmt.Fprintf(stderr, "      ! %s\n", c.Warning)
		}
	}
	if rep.Pass {
		fmt.Fprintln(stdout, token)
		return 0
	}
	return 1
}

func emitJSON(w io.Writer, v any, ok bool) int {
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	_ = enc.Encode(v)
	if ok {
		return 0
	}
	return 1
}

func printTLS(w io.Writer, r TLSReport) {
	fmt.Fprintf(w, "%s  (SNI %s)\n", r.Target, r.ServerName)
	if r.HandshakeErr != "" {
		fmt.Fprintf(w, "  handshake FALLÓ: %s\n", r.HandshakeErr)
		return
	}
	fmt.Fprintf(w, "  %s · %s", r.Version, r.Cipher)
	if r.ALPN != "" {
		fmt.Fprintf(w, " · ALPN %s", r.ALPN)
	}
	fmt.Fprintf(w, " · cert cliente: %v\n", r.ClientCert)
	for i, c := range r.Chain {
		fmt.Fprintf(w, "  [%d] %s\n      emisor  %s\n      validez %s → %s (%d días)\n", i, c.Subject, c.Issuer, c.NotBefore, c.NotAfter, c.DaysLeft)
		if sans := append(append(append([]string{}, c.DNSNames...), c.URIs...), c.IPs...); len(sans) > 0 {
			fmt.Fprintf(w, "      SAN     %s\n", strings.Join(sans, ", "))
		} else {
			fmt.Fprintln(w, "      SAN     (ninguno)")
		}
	}
	if r.Verified {
		fmt.Fprintln(w, "  verificación: OK")
	} else {
		fmt.Fprintf(w, "  verificación: FALLA — %s\n", r.VerifyError)
	}
}
