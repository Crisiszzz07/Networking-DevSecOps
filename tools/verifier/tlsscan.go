package main

import (
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"net"
	"os"
	"strings"
	"time"
)

type CertInfo struct {
	Subject   string   `json:"subject"`
	Issuer    string   `json:"issuer"`
	DNSNames  []string `json:"dns_sans,omitempty"`
	URIs      []string `json:"uri_sans,omitempty"`
	IPs       []string `json:"ip_sans,omitempty"`
	NotBefore string   `json:"not_before"`
	NotAfter  string   `json:"not_after"`
	DaysLeft  int      `json:"days_left"`
}

type TLSReport struct {
	Target       string     `json:"target"`
	ServerName   string     `json:"server_name"`
	Version      string     `json:"version"`
	Cipher       string     `json:"cipher"`
	ALPN         string     `json:"alpn,omitempty"`
	ClientCert   bool       `json:"client_cert_sent"`
	Chain        []CertInfo `json:"chain"`
	Verified     bool       `json:"verified"`
	VerifyError  string     `json:"verify_error,omitempty"`
	HandshakeErr string     `json:"handshake_error,omitempty"`
}

// ScanTLS completes the handshake without trusting it, then verifies the chain
// explicitly so the report shows the chain even when validation fails.
func ScanTLS(target, serverName, caFile, certFile, keyFile string, timeout time.Duration) (TLSReport, error) {
	host, _, err := net.SplitHostPort(target)
	if err != nil {
		return TLSReport{}, err
	}
	if serverName == "" {
		serverName = host
	}
	rep := TLSReport{Target: target, ServerName: serverName}
	cfg := &tls.Config{ServerName: serverName, InsecureSkipVerify: true, NextProtos: []string{"h2", "http/1.1"}}
	if certFile != "" {
		pair, err := tls.LoadX509KeyPair(certFile, keyFile)
		if err != nil {
			return rep, fmt.Errorf("certificado cliente: %w", err)
		}
		cfg.Certificates = []tls.Certificate{pair}
		rep.ClientCert = true
	}
	var roots *x509.CertPool
	if caFile != "" {
		pem, err := os.ReadFile(caFile)
		if err != nil {
			return rep, err
		}
		roots = x509.NewCertPool()
		if !roots.AppendCertsFromPEM(pem) {
			return rep, fmt.Errorf("%s no contiene certificados PEM", caFile)
		}
	}
	conn, err := tls.DialWithDialer(&net.Dialer{Timeout: timeout}, "tcp", target, cfg)
	if err != nil {
		rep.HandshakeErr = err.Error()
		return rep, nil
	}
	defer conn.Close()
	// TLS 1.3 servers requesting a client cert may reject it after the handshake; a read surfaces that.
	_ = conn.SetReadDeadline(time.Now().Add(300 * time.Millisecond))
	_, _ = conn.Read(make([]byte, 1))
	st := conn.ConnectionState()
	rep.Version = tls.VersionName(st.Version)
	rep.Cipher = tls.CipherSuiteName(st.CipherSuite)
	rep.ALPN = st.NegotiatedProtocol
	for _, c := range st.PeerCertificates {
		ci := CertInfo{
			Subject:   c.Subject.String(),
			Issuer:    c.Issuer.String(),
			DNSNames:  c.DNSNames,
			NotBefore: c.NotBefore.UTC().Format(time.RFC3339),
			NotAfter:  c.NotAfter.UTC().Format(time.RFC3339),
			DaysLeft:  int(time.Until(c.NotAfter).Hours() / 24),
		}
		for _, u := range c.URIs {
			ci.URIs = append(ci.URIs, u.String())
		}
		for _, ip := range c.IPAddresses {
			ci.IPs = append(ci.IPs, ip.String())
		}
		rep.Chain = append(rep.Chain, ci)
	}
	if len(st.PeerCertificates) > 0 {
		inter := x509.NewCertPool()
		for _, c := range st.PeerCertificates[1:] {
			inter.AddCert(c)
		}
		_, verr := st.PeerCertificates[0].Verify(x509.VerifyOptions{DNSName: serverName, Roots: roots, Intermediates: inter})
		if verr != nil {
			rep.VerifyError = verr.Error()
			if strings.Contains(verr.Error(), "legacy Common Name") {
				rep.VerifyError += " (el certificado sólo tiene CN: producción exige SAN)"
			}
		} else {
			rep.Verified = true
		}
	}
	return rep, nil
}
