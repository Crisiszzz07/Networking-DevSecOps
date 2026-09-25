---
id: "modulo-01"
slug: "anatomia-paquete-pila-transporte"
title: "Anatomía del Paquete y la Pila de Transporte"
layer: "L3/L4"
primary_books:
  - title: "Practical Packet Analysis"
    chapters: ["Capítulo 5: Internet Protocol", "Capítulo 6: TCP, UDP, and ICMP", "Capítulo 9: Real-World Scenarios"]
    target_competencies: ["Decodificar IPv4/TCP desde bytes.", "Determinar la causa de fallo con PCAP."]
content_version: 2
lab_runtime: "Linux, iproute2, tcpdump, nc; root"
---
# 1. CORE MECHANICS & DEEP THEORY

> Trazabilidad: Practical Packet Analysis (PPA), caps. 5, 6 y 9. La aplicación cloud-native es síntesis técnica.

IPv4 mínimo tiene 20 bytes: Version=4, IHL en palabras de 32 bits para localizar L4, Total Length, Identification, flags DF/MF, Fragment Offset, TTL, Protocol y checksum de cabecera. TTL cero causa ICMP Time Exceeded; Protocol es TCP=6, UDP=17, ICMP=1. El checksum se recalcula cuando NAT o router modifica cabecera. [PPA, cap. 5]

Una ruta se elige por longest-prefix match; /p contiene 2^(32-p) direcciones. CIDR expresa alcance, no autorización. Campos origen/destino pueden ser falsificados dentro de una red permisiva; fragmentos pueden evadir controles que no reensamblen igual; ACL TCP deja UDP/ICMP sin política. [PPA, cap. 5]

TCP usa 4-tupla, SEQ y ACK. ACK es siguiente byte esperado; SYN y FIN consumen secuencia. Apertura: SYN(x), SYN-ACK(y,x+1), ACK(y+1); cliente CLOSED→SYN-SENT→ESTABLISHED, servidor LISTEN→SYN-RECEIVED→ESTABLISHED. FIN cierra una dirección; RST aborta estado. [PPA, cap. 6]

Una política stateful autoriza SYN esperado y retorno ESTABLISHED,RELATED. Timeout sin SYN-ACK es compatible con DROP; RST demuestra stack alcanzable sin listener. Capture sobre veth/NIC, no sólo any: offload/NAT alteran evidencia. [PPA, cap. 9]


## Lectura de bytes: de hexadecimal a decisión de red

Un analista no empieza por Wireshark: empieza por invariantes. En una cabecera cuyo inicio es 45 00 00 3c, el byte 45 se separa como 0100|0101: versión 4 e IHL=5, por tanto L4 comienza en el byte 20. 00 3c es 60 bytes de datagrama total. Si Flags+Offset es 40 00, DF está activo y offset=0: un router con MTU menor no debe fragmentar; devuelve ICMP Fragmentation Needed. En una ruta de contenedores, esa señal puede desaparecer por filtrado y convertirse en un fallo que sólo aparece con respuestas grandes. [PPA, cap. 5]

    Byte:        0          1          2          3
    Hex:        45         00         00         3c
    Bits:     0100|0101       DSCP       Total Length = 60
              IPv4 | IHL=5                 └─ 20 B IP + 20 B TCP + 20 B data/options

| Observación en PCAP | Inferencia correcta | Siguiente comprobación |
|---|---|---|
| TTL pasa 64 → 63 | cruzó al menos un router L3 | capture ambos lados del router |
| DF=1 y payload grande falla | posible black-hole de PMTUD | ICMP type 3/code 4 y MTU de overlay |
| mismo ID con offsets 0 y 185 | fragmentación del datagrama | reensamblado de endpoint y sensor |
| checksum malo sólo en host | posible TX checksum offload | capture en peer |

## TCP no es una secuencia de tres paquetes

El handshake fija dos espacios de secuencia independientes. Si cliente emite SYN con SEQ=1000 y servidor SYN-ACK con SEQ=7000, el ACK final vale 7001; cuando cliente envía 120 bytes con SEQ=1001, ACK acumulativo esperado es 1121. Una ventana cero no es caída de red sino back-pressure del receptor. Window Scale y MSS se negocian en SYN; comparar sólo Window sin escala da un diagnóstico equivocado. [PPA, cap. 6]

    cliente                                      servidor
    SYN SEQ=1000, MSS=1460, WS=7  ───────────►  LISTEN → SYN-RECEIVED
    ◄─────────── SYN,ACK SEQ=7000 ACK=1001      reserva estado
    ACK SEQ=1001 ACK=7001         ───────────►  ESTABLISHED
    PSH,ACK SEQ=1001 LEN=120      ───────────►
    ◄─────────── ACK=1121                      confirma bytes, no paquetes

| Firma | Hipótesis | Evidencia que la refuta |
|---|---|---|
| SYN repetido, sin respuesta | ruta/firewall/host caído | SYN-ACK visto en otra interfaz |
| SYN seguido de RST | host alcanzable, puerto cerrado | RST inyectado por middlebox |
| ACK duplicados y retransmisión | pérdida tras handshake | ACK llegó al punto de captura |
| ventana cero | receptor o aplicación saturados | nueva Window Update posterior |

## Caso de producción: IP no equivale a identidad

Un pod de pagos que permite 10.44.0.0/24 puede aceptar otra carga tras reprogramación. La tupla L3/L4 depura flujo, no afirma quién es el workload. La defensa combina ruta, política stateful, identidad y telemetría. [PPA, cap. 9]

| Capa | Pregunta | Evidencia |
|---|---|---|
| ruta | ¿por dónde debía ir? | prefijo ganador/gateway |
| TCP | ¿hubo sesión y quién cerró? | SEQ/ACK, flags, retransmisión |
| firewall | ¿qué decisión se tomó? | regla y conntrack |
| identidad | ¿qué servicio era? | SAN/SPIFFE y mTLS log |

# 2. SCHEMATIC & TOPOLOGY BLUEPRINTS

**Fuente del blueprint:** PPA, caps. 5–6; adaptación de laboratorio para aislar L3/L4.

    nodes:
      client: {netns: ln1-client, cidr: 10.44.0.2/24, source_port: 40000}
      router: {interfaces: ["r0=10.44.0.1/24", "r1=10.45.0.1/24"], forwarding: true}
      server: {netns: ln1-server, cidr: 10.45.0.2/24, listen: tcp/8080}
    flow: "client → PREROUTING → route → FORWARD → POSTROUTING → server"
    inspection: ["tcpdump ln1-r1", "FORWARD counters", "server ss"]

# 3. INTERACTIVE LAB SPECIFICATION

**Lab Identifier:** lab-01-tcp-pcap-state

**Fuente del diseño de laboratorio:** PPA, caps. 6 y 9.

**Objetivo Práctico:** capturar el handshake y diferenciar DROP de puerto cerrado.

**Topología del Entorno:** Linux root, ip, tcpdump, iptables, nc.

**Setup Script (Bash / Go):**

    set -euo pipefail
    for n in ln1-client ln1-server; do ip netns del "$n" 2>/dev/null || true; done
    ip link del ln1-r0 2>/dev/null || true; ip link del ln1-r1 2>/dev/null || true
    ip netns add ln1-client; ip netns add ln1-server
    ip link add ln1-c0 type veth peer name ln1-r0; ip link add ln1-s0 type veth peer name ln1-r1
    ip link set ln1-c0 netns ln1-client; ip link set ln1-s0 netns ln1-server
    ip addr add 10.44.0.1/24 dev ln1-r0; ip addr add 10.45.0.1/24 dev ln1-r1; ip link set ln1-r0 up; ip link set ln1-r1 up
    ip -n ln1-client addr add 10.44.0.2/24 dev ln1-c0; ip -n ln1-client link set lo up; ip -n ln1-client link set ln1-c0 up; ip -n ln1-client route add default via 10.44.0.1
    ip -n ln1-server addr add 10.45.0.2/24 dev ln1-s0; ip -n ln1-server link set lo up; ip -n ln1-server link set ln1-s0 up; ip -n ln1-server route add default via 10.45.0.1
    sysctl -qw net.ipv4.ip_forward=1
    ip netns exec ln1-server sh -c 'nohup nc -lk -p 8080 >/dev/null 2>&1 &'

**Hands-On Walkthrough:**

1. Ejecute tcpdump -ni ln1-r1 -vvv 'tcp port 8080' -c 5 y, en otra terminal, ip netns exec ln1-client sh -c 'printf ok | nc -w1 10.45.0.2 8080'.
2. Se espera Flags [S], [S.], [.], y [P.] o ACK de dos bytes.
3. Inserte FORWARD DROP cliente→servidor tcp/8080: se esperan SYN retransmitidos sin SYN-ACK. Elimine regla y mate nc: se espera [R.].

**Definición de Terminado (DoD) & Verification Script:**

    #!/usr/bin/env bash
    set -euo pipefail
    ip -n ln1-client route get 10.45.0.2 | grep -q 'via 10.44.0.1'
    ip netns exec ln1-server ss -ltn | grep -q ':8080'
    ! iptables -S FORWARD | grep -q -- '--dport 8080 -j DROP'
    echo PASS-lab-01

# 4. GOTCHAS & PRODUCTION PITFALLS

- Checksum de captura host puede ser offload; valide desde peer. [PPA, caps. 2, 6]
- FIN no equivale a cierre bidireccional; CLOSE-WAIT agota descriptores. [PPA, cap. 6]
- Fragmentos posteriores no llevan TCP; trate fragmentación explícitamente. [PPA, cap. 5]
