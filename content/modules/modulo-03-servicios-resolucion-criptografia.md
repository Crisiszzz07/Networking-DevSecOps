---
id: "modulo-03"
slug: "servicios-resolucion-criptografia-transito"
title: "Servicios de Red, Resolución y Criptografía de Tránsito"
layer: "L7"
primary_books:
  - title: "Practical Packet Analysis"
    chapters: ["Capítulo 8: Common Upper-Layer Protocols", "Capítulo 9: Real-World Scenarios"]
    target_competencies: ["Analizar DNS y L7 en PCAP."]
  - title: "Zero Trust Networks"
    chapters: ["Capítulo 2: Managing Trust"]
    target_competencies: ["Diseñar PKI/mTLS de mínimo privilegio."]
content_version: 2
lab_runtime: "Linux, Bash, openssl"
---
# 1. CORE MECHANICS & DEEP THEORY

> Trazabilidad: DNS y L7: Practical Packet Analysis (PPA), caps. 8–9. CA, PKI, trust: Zero Trust Networks (ZTN), cap. 2. TLS 1.3 es actualización operativa, no atribución a PPA 2009.

DNS usa UDP/53; TCP/53 sirve transferencias, respuestas grandes/fallback. Cabecera: ID, QR/Opcode/AA/TC/RD/RA/RCODE, QD/AN/NS/AR. RR: NAME, TYPE, CLASS, TTL, RDLENGTH, RDATA. A entrega IPv4; SRV prioridad/peso/puerto/target; TXT texto opaco. TTL permite cache, no autorización. [PPA, cap. 8]

TLS 1.3 negocia secreto efímero con ClientHello (SNI, ALPN, key share), ServerHello y mensajes cifrados. X.509 vincula clave/identidad: valide trust anchor, tiempo, SAN/hostname, key usage y revocación. SNI selecciona virtual host, no autentica.

mTLS exige certificado de ambos pares. Autorice URI SAN/SPIFFE ID concreta, no sólo cadena válida. Control plane emite/rota identidad; data plane decide por conexión. [ZTN, cap. 2]

| Elemento | Verificación | Riesgo |
|---|---|---|
| DNS | RCODE, TTL, servidor | egress por nombre no controlado |
| TLS servidor | SAN/cadena/tiempo | skip verify |
| TLS cliente | CA/SAN workload | confiar CA demasiado amplia |
| rotación | trust bundle solapado | cert permanente |


## DNS: una respuesta es una estructura, no sólo una IP

Cabecera DNS separa pregunta, respuesta, autoridad y adicional. QR distingue query/response; RD pide recursión; RA declara disponibilidad; AA indica respuesta autoritativa; RCODE comunica resultado. Resolver puede seguir CNAME/delegaciones y cachear respuestas o errores. Registre nombre, servidor, RCODE, TTL e IP final: una IP sola no explica resolución. [PPA, cap. 8]

    Query: ID=0x4a11 RD=1 QNAME=api.internal QTYPE=A
    Reply: ID=0x4a11 QR=1 RA=1 RCODE=NOERROR
           Answer: api.internal. 30 IN A 10.60.0.20
           Additional: _grpc._tcp.api.internal. 30 IN SRV 0 5 8443 api.internal.

| Resultado | Significado | Error común |
|---|---|---|
| NXDOMAIN | nombre no existe | reintentar en resolver público |
| SERVFAIL | resolver no completó | asumir fallo de aplicación |
| NOERROR sin Answer | existe, pero no ese tipo | ignorar QTYPE |
| TC=1 | truncado en UDP | bloquear TCP/53 |

DNS dirige conexión; no prueba identidad. Aún con IP correcta, TLS debe validar el peer y egress debe limitar resolver/destino. [PPA, caps. 8–9; ZTN, cap. 2]

## TLS 1.3: autenticación, secreto y contexto

TLS 1.3 negocia secreto efímero con ClientHello (SNI, ALPN, key share), ServerHello y mensajes cifrados. CertificateVerify prueba clave privada; Finished vincula transcripción de handshake. El cliente sigue obligado a validar trust anchor, tiempo y SAN esperado. [ZTN, cap. 2]

    app                         api
    ClientHello(SNI, ALPN, key_share) ─────────►
    ◄──────── ServerHello + {Certificate, CertificateVerify, Finished}
    {Certificate, CertificateVerify, Finished} ─►
    ◄──────── application data with traffic keys

| Chequeo | Antes de autorizar | Rechazo sano |
|---|---|---|
| servidor | SAN api.internal | cert válido para db.internal |
| cadena | issuer esperado | CA pública inesperada |
| cliente | URI SAN permitida | workload de otro namespace |
| contexto | método/puerto/destino | client válido hacia DB |

## Caso visual: DNS correcto, TLS incorrecto

Si DNS devuelve 10.60.0.20 y TCP conecta, pero hostname mismatch, transporte funcionó y autenticación falló. No se arregla con insecure-skip-verify: investigue SAN, SNI, despliegue y trust bundle. [ZTN, cap. 2]

# 2. SCHEMATIC & TOPOLOGY BLUEPRINTS

**Fuente del blueprint:** PPA, cap. 8; ZTN, cap. 2.

    nodes:
      app: {ip: 10.60.0.10/24, id: "spiffe://learn/ns/prod/sa/app"}
      dns: {ip: 10.60.0.53/24, record: "api.internal A 10.60.0.20"}
      api: {ip: 10.60.0.20/24, listen: tcp/8443, id: "spiffe://learn/ns/prod/sa/api"}
    flow: ["app→dns UDP/53", "app→api TCP/8443 with SNI and mTLS"]
    inspection: ["DNS RCODE", "cert chain", "SAN authorization"]

# 3. INTERACTIVE LAB SPECIFICATION

**Lab Identifier:** lab-03-mtls-chain

**Fuente del diseño de laboratorio:** ZTN, cap. 2; la gramática TLS usada es operativa actual.

**Objetivo Práctico:** emitir CA efímera y probar mTLS.

**Topología del Entorno:** host Linux, OpenSSL 1.1.1+, directorio .lab-03.

**Setup Script (Bash / Go):**

    set -euo pipefail
    rm -rf .lab-03; mkdir .lab-03; cd .lab-03
    openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj '/CN=learn-ca' -keyout ca.key -out ca.crt >/dev/null 2>&1
    for name in server client; do
      openssl req -newkey rsa:2048 -nodes -subj "/CN=$name" -keyout "$name.key" -out "$name.csr" >/dev/null 2>&1
      openssl x509 -req -days 1 -CA ca.crt -CAkey ca.key -CAcreateserial -in "$name.csr" -out "$name.crt" >/dev/null 2>&1
    done
    nohup openssl s_server -accept 8443 -cert server.crt -key server.key -CAfile ca.crt -Verify 1 -www >server.log 2>&1 &

**Hands-On Walkthrough:**

1. Ejecute openssl s_client -connect 127.0.0.1:8443 -servername api.internal -CAfile .lab-03/ca.crt -cert .lab-03/client.crt -key .lab-03/client.key -verify_return_error.
2. Se espera Verify return code: 0 (ok). Sin certificado cliente, el servidor rechaza handshake.
3. openssl x509 -in .lab-03/server.crt -noout -issuer -subject -dates permite forense.

**Definición de Terminado (DoD) & Verification Script:**

    #!/usr/bin/env bash
    set -euo pipefail
    openssl verify -CAfile .lab-03/ca.crt .lab-03/server.crt | grep -q ': OK'
    openssl s_client -connect 127.0.0.1:8443 -CAfile .lab-03/ca.crt -cert .lab-03/client.crt -key .lab-03/client.key -verify_return_error </dev/null 2>&1 | grep -q 'Verify return code: 0 (ok)'
    echo PASS-lab-03

# 4. GOTCHAS & PRODUCTION PITFALLS

- TC=1 exige fallback DNS TCP. [PPA, cap. 8]
- CA privada necesita emisión/trust bundle/rotación automatizadas. [ZTN, cap. 2]
- Laboratorio usa CN: producción exige SAN validado.
