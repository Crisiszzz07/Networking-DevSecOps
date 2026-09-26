---
id: "modulo-02"
slug: "primitivas-red-kernel-linux"
title: "Primitivas de Red en el Kernel de Linux"
layer: "Kernel"
primary_books:
  - title: "Networking and Kubernetes: A Layered Approach"
    chapters: ["Capítulo 2: Linux Networking Basics", "Capítulo 3: Container Networking Basics"]
    target_competencies: ["Construir netns, veth y bridge.", "Auditar Netfilter, NAT y conntrack."]
content_version: 2
lab_runtime: "Linux, iproute2, iptables/nftables; root"
---
# 1. CORE MECHANICS & DEEP THEORY

> Trazabilidad: Networking and Kubernetes (N&K), caps. 2–3.

## El incidente que este módulo te ayuda a desenredar

En el módulo 1 ya viste un SYN salir del cliente y quizá desaparecer. Ahora la pregunta es: **¿qué parte del host Linux decidió su camino?** En un host con contenedores no hay una sola “red”: hay namespaces, cables virtuales, bridges, rutas, traducciones y reglas que pueden afectar el mismo flujo en instantes distintos. [N&K, caps. 2–3]

El objetivo no es aprender comandos `ip` o `iptables` de memoria. Es poder explicar, por ejemplo: “el paquete salió del namespace worker, cruzó su veth, fue enrutado por el host y la cadena FORWARD lo descartó antes del namespace api”.

## Mapa mínimo: del proceso aislado a la decisión de firewall

    proceso en contenedor
             │
             ▼
    network namespace ── tiene sus propios puertos, rutas e interfaces
             │
             ▼
    veth ── cable virtual; un extremo recibe lo que el otro transmite
             │
             ▼
    bridge o ruta L3 ── decide por MAC o por prefijo IP
             │
             ▼
    Netfilter/conntrack ── permite, deniega o traduce el flujo

La distinción importante es esta: un bridge no decide por IP ni “pasa por FORWARD” necesariamente; una ruta L3 sí lleva el paquete a Netfilter. Por eso primero identificas el camino y sólo después interpretas una regla. [N&K, cap. 2]

## Ruta de estudio y conexión con el roadmap

1. Construye dos namespaces y mira qué objetos pertenecen a cada uno.
2. Sigue un paquete por veth y bridge para distinguir L2 de routing L3.
3. Usa PREROUTING, FORWARD y POSTROUTING para ubicar una regla.
4. Añade conntrack/NAT para explicar el estado y la pérdida de identidad por IP.

El siguiente módulo añade una pregunta distinta: aun cuando el paquete llega al destino, ¿cómo sabe la aplicación **qué nombre e identidad criptográfica** está al otro lado? Ahí entran DNS, TLS y mTLS.

## El aislamiento aparece antes de que exista un contenedor

Un contenedor recibe un network namespace y objetos kernel. Al crearlo sólo existe lo. CNI o Docker crea un veth, mueve un extremo, asigna dirección y añade rutas. Host conserva el peer y lo conecta a bridge, VRF o ruta L3. Por eso una captura en eth0 no ve tráfico que nunca salió del bridge. [N&K, caps. 2–3]

    proceso api → netns api: eth0 172.30.10.2/24 ─ veth ─ br-ln2-api
                                                        │
                                       host route + FORWARD policy
                                                        │
                              br-ln2-worker ─ veth ─ netns worker

Bridge decide por MAC y router por prefijo. Si dos workloads viven en mismo bridge/subred, un frame puede cruzar L2 sin tocar FORWARD: separe dominios o aplique enforcement bridge/CNI. [N&K, cap. 2]

## Netfilter y conntrack: primer paquete frente a flujo

Conntrack fija tupla original/reply al primer paquete. NAT se fija entonces y los posteriores reutilizan estado. DNAT puede transformar destino público 203.0.113.10:443 a backend 172.30.10.2:8443 antes de FORWARD, mientras conntrack conserva ambos. Filtrar sin decir pre/post NAT produce reglas aparentemente correctas que no protegen backend esperado. [N&K, cap. 2]

| Fase | Valor relevante | Pregunta de auditoría |
|---|---|---|
| PREROUTING nat | destino público | ¿a qué backend se tradujo? |
| FORWARD filter | destino tras DNAT | ¿backend permitido correcto? |
| POSTROUTING nat | origen tras SNAT | ¿qué identidad pierde receptor? |
| conntrack | original/reply tuple | ¿retorno pertenece a flujo aprobado? |

MASQUERADE resuelve egress con IP variable, pero borra origen para receptor y abre estado por conexión. Dimensionar conntrack, registrar drops y retener identidad del workload son controles operativos. [N&K, cap. 2]

## Lectura de una denegación sin adivinar

LN2-FORWARD recibe sólo worker→api: permite retorno establecido, TCP/8080 y termina en DROP. El DROP no protege host entero; protege el flujo en scope. Esta precisión evita que un lab se convierta en un cambio peligroso de firewall global. [N&K, cap. 2]

    pkts bytes target   prot  source              destination
       1    60 ACCEPT   all   0.0.0.0/0           0.0.0.0/0  ctstate RELATED,ESTABLISHED
       1    60 ACCEPT   tcp   0.0.0.0/0           0.0.0.0/0  tcp dpt:8080
       1    60 DROP     all   0.0.0.0/0           0.0.0.0/0

Si el contador DROP sube al probar 8081 hay enforcement. Si no cambia, investigue ruta/bridge/cadena antes de culpar la regla.

## Referencia técnica: primitivas y datapath

Cada netns tiene interfaces, rutas, puertos, sockets y Netfilter propios. Veth es par: TX en uno es RX en peer. Bridge aprende MAC origen en FDB, entrega por puerto conocido o inunda unknown/broadcast; es L2 y no implementa autorización L3. [N&K, caps. 2–3]

Datapath IPv4: NIC→PREROUTING→ruta→INPUT para local, o FORWARD→POSTROUTING para tránsito. Paquete local: OUTPUT→POSTROUTING. Conntrack asocia tupla inicial/reply; nat crea traducción por flujo; filter acepta/deniega; mangle marca. MASQUERADE es SNAT dinámico: útil para egress variable, costoso en atribución/estado. [N&K, cap. 2]

| Primitiva | Invariante | Riesgo cloud-native |
|---|---|---|
| netns | puertos/rutas aislados | asumir host y pod comparten listener |
| veth | frontera por workload | capturar interfaz equivocada |
| bridge | forwarding MAC | lateral movement L2 |
| conntrack | estado/timeout | agotamiento DoS |
| SNAT | origen reescrito | logs sin IP cliente |

DNAT en PREROUTING modifica destino antes de FORWARD; documente pre/post NAT. DROP expira; REJECT expone decisión. Default allow FORWARD abre red lateral.

# 2. SCHEMATIC & TOPOLOGY BLUEPRINTS

**Fuente del blueprint:** N&K, caps. 2–3.

    nodes:
      host: {bridges: ["br-ln2-worker=172.30.20.1/24", "br-ln2-api=172.30.10.1/24"], forwarding: true}
      api: {netns: ln2-api, cidr: 172.30.10.2/24, gateway: 172.30.10.1, listen: tcp/8080}
      worker: {netns: ln2-worker, cidr: 172.30.20.2/24, gateway: 172.30.20.1}
    flow: "worker veth → worker bridge → host route/FORWARD → api bridge → api veth"
    policy: "worker→api tcp/8080 plus ESTABLISHED return"
    inspection: ["bridge fdb", "iptables FORWARD", "conntrack"]

# 3. INTERACTIVE LAB SPECIFICATION

**Lab Identifier:** lab-02-netns-netfilter

**Fuente del diseño de laboratorio:** N&K, cap. 2.

**Objetivo Práctico:** permitir solamente worker→api tcp/8080.

**Topología del Entorno:** Linux, ip, iptables, nc; root.

**Setup Script (Bash / Go):**

    set -euo pipefail
    for n in ln2-api ln2-worker; do ip netns del "$n" 2>/dev/null || true; done
    for b in br-ln2-api br-ln2-worker; do ip link del "$b" 2>/dev/null || true; done
    ip link add br-ln2-api type bridge; ip addr add 172.30.10.1/24 dev br-ln2-api; ip link set br-ln2-api up
    ip link add br-ln2-worker type bridge; ip addr add 172.30.20.1/24 dev br-ln2-worker; ip link set br-ln2-worker up
    ip netns add ln2-api; ip link add v-ln2-api type veth peer name eth0; ip link set eth0 netns ln2-api; ip link set v-ln2-api master br-ln2-api; ip link set v-ln2-api up
    ip -n ln2-api link set lo up; ip -n ln2-api addr add 172.30.10.2/24 dev eth0; ip -n ln2-api link set eth0 up; ip -n ln2-api route add default via 172.30.10.1
    ip netns add ln2-worker; ip link add v-ln2-worker type veth peer name eth0; ip link set eth0 netns ln2-worker; ip link set v-ln2-worker master br-ln2-worker; ip link set v-ln2-worker up
    ip -n ln2-worker link set lo up; ip -n ln2-worker addr add 172.30.20.2/24 dev eth0; ip -n ln2-worker link set eth0 up; ip -n ln2-worker route add default via 172.30.20.1
    sysctl -qw net.ipv4.ip_forward=1
    iptables -N LN2-FORWARD 2>/dev/null || true; iptables -F LN2-FORWARD
    iptables -C FORWARD -s 172.30.20.0/24 -d 172.30.10.0/24 -j LN2-FORWARD 2>/dev/null || iptables -I FORWARD 1 -s 172.30.20.0/24 -d 172.30.10.0/24 -j LN2-FORWARD
    iptables -A LN2-FORWARD -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
    iptables -A LN2-FORWARD -p tcp --dport 8080 -j ACCEPT
    iptables -A LN2-FORWARD -j DROP
    ip netns exec ln2-api sh -c 'nohup nc -lk -p 8080 >/dev/null 2>&1 &'

**Hands-On Walkthrough:**

1. Ping worker→gateway y api→gateway; bridge fdb show br br-ln2-worker y bridge fdb show br br-ln2-api muestran MAC dinámicas.
2. Ejecute echo hi | nc desde worker a api/8080; iptables -nvL FORWARD incrementa el contador.
3. conntrack -L -p tcp muestra original/reply si está instalado. Con default-DROP, api:8081 falla.

**Definición de Terminado (DoD) & Verification Script:**

    #!/usr/bin/env bash
    set -euo pipefail
    ip -br link show br-ln2-api | grep -q UP
    ip netns exec ln2-api ss -ltn | grep -q ':8080'
    iptables -S LN2-FORWARD | grep -q -- '--dport 8080 -j ACCEPT'
    echo PASS-lab-02

# 4. GOTCHAS & PRODUCTION PITFALLS

- Una allow anterior hace inalcanzable denegación posterior. [N&K, cap. 2]
- ip_forward no crea rutas ni política FORWARD. [N&K, cap. 2]
- No trate iptables/nftables como fuentes de verdad independientes.
- NAT degrada identidad por IP. [N&K, caps. 2–3]
