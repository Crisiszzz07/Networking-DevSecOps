package main

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

// Module is the subset of /content/modules/*.md the verifier needs. The web app
// parses the same files with Zod; this parser only extracts the lab contract.
type Module struct {
	File  string
	ID    string
	Slug  string
	Title string
	LabID string
	Setup string
	DoD   string
}

var (
	fmField   = regexp.MustCompile(`(?m)^(id|slug|title):\s*"?([^"\n]+)"?\s*$`)
	labIDRe   = regexp.MustCompile(`\*\*Lab Identifier:\*\*\s*(\S+)`)
	setupHead = regexp.MustCompile(`(?m)^\*\*Setup Script[^\n]*\*\*\s*$`)
	dodHead   = regexp.MustCompile(`(?m)^\*\*Definici[oó]n de Terminado[^\n]*\*\*\s*$`)
)

// FindContentDir walks up from dir until it finds content/modules.
func FindContentDir(dir string) (string, error) {
	if abs, err := filepath.Abs(dir); err == nil {
		dir = abs
	}
	for {
		c := filepath.Join(dir, "content", "modules")
		if st, err := os.Stat(c); err == nil && st.IsDir() {
			return c, nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return "", errors.New("no encontré content/modules (usa --content)")
		}
		dir = parent
	}
}

// indentedBlockAfter returns the first 4-space indented code block after loc.
func indentedBlockAfter(src string, loc []int) string {
	if loc == nil {
		return ""
	}
	lines := strings.Split(src[loc[1]:], "\n")
	var out []string
	started := false
	for _, l := range lines {
		if strings.HasPrefix(l, "    ") {
			started = true
			out = append(out, l[4:])
			continue
		}
		if strings.TrimSpace(l) == "" {
			if started {
				out = append(out, "")
			}
			continue
		}
		if started {
			break
		}
		// Non-code paragraph before the block: the heading had no block.
		return ""
	}
	return strings.TrimRight(strings.Join(out, "\n"), "\n") + "\n"
}

func ParseModule(path string) (Module, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return Module{}, err
	}
	src := string(raw)
	m := Module{File: path}
	parts := strings.SplitN(src, "\n---", 2)
	if !strings.HasPrefix(src, "---") || len(parts) < 2 {
		return m, fmt.Errorf("%s: falta frontmatter", filepath.Base(path))
	}
	for _, f := range fmField.FindAllStringSubmatch(parts[0], -1) {
		switch f[1] {
		case "id":
			m.ID = f[2]
		case "slug":
			m.Slug = f[2]
		case "title":
			m.Title = f[2]
		}
	}
	if l := labIDRe.FindStringSubmatch(src); l != nil {
		m.LabID = l[1]
	}
	m.Setup = indentedBlockAfter(src, setupHead.FindStringIndex(src))
	m.DoD = indentedBlockAfter(src, dodHead.FindStringIndex(src))
	switch {
	case m.ID == "":
		return m, fmt.Errorf("%s: frontmatter sin id", filepath.Base(path))
	case m.LabID == "":
		return m, fmt.Errorf("%s: falta **Lab Identifier:**", filepath.Base(path))
	case m.DoD == "":
		return m, fmt.Errorf("%s: falta el script DoD", filepath.Base(path))
	}
	return m, nil
}

func LoadModules(dir string) ([]Module, error) {
	files, err := filepath.Glob(filepath.Join(dir, "*.md"))
	if err != nil {
		return nil, err
	}
	sort.Strings(files)
	var mods []Module
	for _, f := range files {
		m, err := ParseModule(f)
		if err != nil {
			return nil, err
		}
		mods = append(mods, m)
	}
	return mods, nil
}

// Find resolves a lab id, module id, slug or bare number ("1", "01").
func Find(mods []Module, key string) (Module, error) {
	k := strings.TrimSpace(key)
	for _, m := range mods {
		num := strings.TrimPrefix(m.ID, "modulo-")
		if k == m.LabID || k == m.ID || k == m.Slug || k == num || "0"+k == num {
			return m, nil
		}
	}
	return Module{}, fmt.Errorf("no existe el lab o módulo %q (prueba `lnverify list`)", key)
}
