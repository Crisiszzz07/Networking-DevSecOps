---
id: "modulo-05"
slug: "observabilidad-seguridad-kernel-ebpf"
title: "Observabilidad y Seguridad en el Kernel con eBPF"
layer: "eBPF"
primary_books:
  - title: "Learning eBPF"
    chapters: ["Capítulo 3: Anatomy of an eBPF Program", "Capítulo 6: The eBPF Verifier", "Capítulo 7: eBPF Program and Attachment Types", "Capítulo 8: eBPF for Networking", "Capítulo 9: eBPF for Security"]
    target_competencies: ["Elegir hooks por semántica/coste.", "Auditar programas, mapas y adjuntos con bpftool."]
content_version: 2
lab_runtime: "Linux BTF/bpftool; CAP_BPF/CAP_PERFMON o root"
---
# 1. CORE MECHANICS & DEEP THEORY

> Trazabilidad: Learning eBPF (LeBPF), caps. 3–4, 6–9.

## El problema: los logs de aplicación no ven todo lo que decide el kernel

Hasta aquí has usado capturas, reglas y objetos de Kubernetes para entender un flujo. Pero un paquete puede descartarse antes de llegar a la pila normal, y un proceso puede abrir un socket sin que una captura aislada te diga qué cgroup o workload lo originó. eBPF existe para observar o controlar puntos muy concretos del kernel con una semántica explícita. [LeBPF, caps. 7–9]

La pregunta no es “¿cómo escribo un programa eBPF?”. Primero es: **¿en qué momento del recorrido necesito evidencia o enforcement, y qué contexto todavía existe allí?** Un XDP temprano puede descartar rápido; un hook posterior puede relacionar el flujo con un Pod o proceso.

## Mapa mínimo: el mismo paquete cambia de contexto al avanzar

    NIC recibe bytes
        │
        ▼
    XDP ── decisión muy temprana: DROP / PASS / REDIRECT
        │ si pasa
        ▼
    stack y conntrack ── red normal del kernel
        │
        ▼
    TC en veth ── interfaz, Pod y política de tránsito
        │
        ▼
    socket/cgroup/LSM ── proceso, identidad u operación

No memorices todos los tipos de programa. Aprende la consecuencia del punto de enganche: un paquete descartado por XDP no llegará a TC ni a un socket; un hook de socket da contexto de proceso que XDP no tiene. [LeBPF, caps. 7–8]

## Ruta de estudio y conexión con el roadmap

1. Comprende por qué el verifier acepta o rechaza un programa.
2. Elige XDP, TC, socket, cgroup o LSM según la pregunta que quieres responder.
3. Diseña eventos que unan paquete, PID, cgroup, netns y política.
4. Inventaría programas, mapas y adjuntos antes de cambiar el datapath.

El último módulo lleva esta misma disciplina a cloud: el control no es sólo un hook local, sino rutas, perímetros, identidad y política distribuidos entre VPC y workloads.

## Referencia técnica: modelo de ejecución eBPF

eBPF se carga vía bpf() como bytecode para VM de registros, helpers y mapas. Verifier valida control flow, contexto/memoria, punteros, límites y terminación antes de admitirlo. Mapas mantienen estado; pinning/enlaces gobiernan vida. BTF/CO-RE dan tipos/portabilidad, no capacidades iguales. [LeBPF, caps. 3–6]

XDP corre RX pre-stack y retorna DROP, PASS, TX, REDIRECT o ABORTED: filtrado temprano. TC corre en interfaz ingress/egress. Socket filter ve socket; cgroup hooks y BPF LSM aportan contexto/previsión. [LeBPF, caps. 7–9]

| Hook | Momento | Uso | Límite |
|---|---|---|---|
| XDP | RX pre-stack | drop/redirect | no semántica socket |
| TC | interfaz | veth policy/telemetría | posterior a XDP |
| socket filter | socket | observación proceso | no enforcement global |
| BPF LSM | operación | prevención | requiere tests |

Evento útil incluye PID, cgroup, netns, identidad y 5-tupla. Syscall aislado no es intención; correlación con policy sí. [LeBPF, cap. 9]


## Lo que el verifier está defendiendo

eBPF no carga C arbitrario: produce instrucciones para VM y verifier demuestra que memoria/contexto, punteros, límites y terminación son seguros. Un puntero a paquete sólo es válido tras probar que hdr+1 no supera data_end. El log del verifier describe un camino que kernel no puede demostrar seguro. [LeBPF, caps. 3 y 6]

    data ───────── parsed header ───────── data_end
      └── comprobar hdr + 1 <= data_end antes de leer ──┘

| Objeto | Conserva | Pregunta de seguridad |
|---|---|---|
| programa | lógica/tipo hook | ¿qué decide y dónde? |
| mapa | estado | ¿límite/cardinalidad? |
| link | adjunto durable | ¿quién lo creó/desmonta? |
| BTF | tipos CO-RE | ¿helper/contexto disponible? |

## El mismo paquete desde hooks distintos

XDP ve RX antes de socket/conntrack. DROP reduce trabajo y evita observación posterior. TC ve ingress/egress de veth; socket hooks correlacionan proceso. Elegir hook es semántica: descartar paquete malformado no equivale a autorizar proceso identificado. [LeBPF, caps. 7–8]

    NIC RX → XDP (bytes/verdict) → stack/conntrack → TC veth → socket (PID/cgroup)

| Pregunta | Hook | Por qué |
|---|---|---|
| ¿descarto flood UDP? | XDP | antes del coste de stack |
| ¿qué Pod emitió flujo? | TC/cgroup | XDP no conoce PID |
| ¿prohíbo operación? | BPF LSM | filtro paquete no ve objeto |
| ¿hay adjunto sorpresa? | bpftool | logs app no ven kernel state |

## Telemetría que sirve para investigar

Un mapa src-IP sólo dice volumen. Evento accionable une timestamp, verdict, program-id, cgroup, PID, netns, 5-tupla y policy-id. Ring buffer debe monitorizar presión: perder eventos bajo carga puede ocultar incidente. [LeBPF, caps. 8–9]

    evento: ts | verdict | program-id | cgroup | pid | src:port → dst:port | policy-id

# 2. SCHEMATIC & TOPOLOGY BLUEPRINTS

**Fuente del blueprint:** LeBPF, caps. 7–8.

    path: "NIC RX → XDP → stack → TC pod-veth → socket"
    nodes:
      xdp: {action: "drop/pass/redirect"}
      tc: {context: "pod netns"}
      map: {kind: hash, key: src_ip, value: packet_count}
      collector: {input: ring_buffer}
    inspection: ["bpftool prog show", "bpftool map show", "bpftool net show"]

# 3. INTERACTIVE LAB SPECIFICATION

**Lab Identifier:** lab-05-bpf-inventory

**Fuente del diseño de laboratorio:** LeBPF, caps. 3–4 y 7.

**Objetivo Práctico:** inventariar eBPF sin cambiar datapath.

**Topología del Entorno:** Linux con bpftool y BTF; root/capacidad BPF.

**Setup Script (Bash / Go):**

    set -euo pipefail
    command -v bpftool >/dev/null
    test -r /sys/kernel/btf/vmlinux
    mkdir -p .lab-05
    bpftool prog show >.lab-05/programs.before.txt
    bpftool map show >.lab-05/maps.before.txt
    bpftool net show >.lab-05/net.before.txt

**Hands-On Walkthrough:**

1. bpftool prog show contiene id, type, tag, loaded_at, uid, map_ids; contenido exacto depende del host.
2. bpftool net show revela adjuntos xdp/tc; ausencia es resultado válido.
3. Use bpftool prog show id ID y map show id MAP_ID para relacionar hook, programa y estado.

**Definición de Terminado (DoD) & Verification Script:**

    #!/usr/bin/env bash
    set -euo pipefail
    test -s .lab-05/programs.before.txt
    test -s .lab-05/maps.before.txt
    test -r /sys/kernel/btf/vmlinux
    bpftool net show >/dev/null
    echo PASS-lab-05

# 4. GOTCHAS & PRODUCTION PITFALLS

- Verifier reject prueba puntero/rango no demostrado. [LeBPF, cap. 6]
- Mapas pinned sobreviven al loader: inventorie referencias. [LeBPF, cap. 4]
- XDP puede evitar iptables/conntrack. [LeBPF, cap. 8]
- Alta cardinalidad agota memoria/collector. [LeBPF, caps. 8–9]
