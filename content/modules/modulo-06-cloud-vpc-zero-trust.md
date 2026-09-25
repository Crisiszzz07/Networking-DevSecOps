---
id: "modulo-06"
slug: "cloud-vpc-zero-trust"
title: "Arquitectura Cloud, VPCs y Principios Zero Trust"
layer: "Cloud"
primary_books:
  - title: "Securing DevOps: Security in the Cloud"
    chapters: ["Capítulo 2: Building a Barebones DevOps Pipeline", "Capítulo 4: Security Layer 2—Protecting Cloud Infrastructures", "Capítulo 5: Security Layer 3—Securing Communications"]
    target_competencies: ["Segmentar cloud y comprobar acceso mínimo."]
  - title: "Zero Trust Networks"
    chapters: ["Capítulo 1: Zero Trust Fundamentals", "Capítulo 2: Managing Trust", "Capítulo 3: Context Aware Agents"]
    target_competencies: ["Diseñar control/data plane con identidad/contexto."]
content_version: 2
lab_runtime: "Bash; validación local transferible a CLI cloud"
---
# 1. CORE MECHANICS & DEEP THEORY

> Trazabilidad: Securing DevOps (SD), caps. 2, 4–5; Zero Trust Networks (ZTN), caps. 1–3.

VPC divide IP en subredes/rutas. Deje Internet-facing sólo en edge; app/datos privados y sin IP pública. Private endpoint evita tránsito público, no autentica llamante. Segmentación requiere rutas, firewall stateful por workload, ACL cuando aporte, identidad y autorización. [SD, caps. 2, 4]

Security Group es stateful por interfaz: entrada permitida permite retorno. NACL suele ser stateless por subred: requiere ambos sentidos y puertos efímeros. No se sustituyen. Restrinja y pruebe SG; no exponga tiers internos. [SD, cap. 4]

Zero Trust niega privado=confiable. Control plane emite/rota identidad/policy; data plane autentica, autoriza y telemetría conexión. SPIFFE/SPIRE puede entregar SVID corto; mTLS autentica pares y policy evalúa ID/destino/contexto. [ZTN, caps. 1–3]

| Capa | Mínimo | Evidencia |
|---|---|---|
| VPC/ruta | no Internet→datos | route table |
| SG | SG→SG, puerto mínimo | reglas/test |
| NACL | ambos sentidos | retorno efímero |
| endpoint | DNS/ruta privada | no NAT/IGW |
| identidad | SVID/cert corto | decisión auditada |


## Una VPC es un grafo de caminos permitidos, no una burbuja confiable

Subred combina rango, route table y controles. Internet-facing sólo en edge; app/datos privados. Private endpoint evita tránsito público, no autentica llamante. Revise caminos cliente→edge→api→datos; toda arista tiene owner, puerto, identidad y prueba. [SD, caps. 2 y 4]

    Internet
       │ 443
    public edge (lb / WAF)
       │ SG edge→api :8443
    private app
       │ SG api→db :5432 + mTLS identity
    private data (sin ruta pública)

Security Group stateful se asocia a workload/interfaz; NACL suele ser stateless por subred y exige retorno/puertos efímeros. Route table decide si existe camino. [SD, cap. 4]

| Cambio | Pregunta previa | Prueba mínima |
|---|---|---|
| SG api:8443 | ¿origen es SG edge, no CIDR global? | edge conecta; otra SG no |
| NACL | ¿retorno efímero vive? | handshake/respuesta completa |
| endpoint privado | ¿DNS/ruta evita NAT/IGW? | consulta DNS + ruta |
| bastion | ¿MFA/auditoría/expiración? | evento y vencimiento |

## Zero Trust añade identidad por flujo

Identidad no nace de IP. Control plane atestigua workload, emite SVID corto/trust bundle. Data plane mTLS autentica ambos pares y policy autoriza identidad/destino/contexto. Si api cambia IP/nodo/VPC, regla por identidad sigue expresando intención. [ZTN, caps. 1–3]

    attestation → control plane issues SVID → workload
    api SVID ── mTLS ──► database verifies issuer + SAN + policy
       └──────── audit: allow/deny + context ────────┘

Un SG abierto puede permitir TCP/5432 desde edge y mTLS aún rechazar su identidad; mTLS no compensa ruta pública innecesaria. Defensa en profundidad comprueba camino de red mínimo y decisión de identidad mínima. [SD, cap. 4; ZTN, cap. 2]

# 2. SCHEMATIC & TOPOLOGY BLUEPRINTS

**Fuente del blueprint:** SD, caps. 2 y 4; ZTN, caps. 1–2.

    vpc: {cidr: 10.80.0.0/16}
    subnets:
      public_edge: {cidr: 10.80.0.0/24, node: lb, ingress: tcp/443}
      private_app: {cidr: 10.80.10.0/24, node: api, ingress: "sg-edge→8443"}
      private_data: {cidr: 10.80.20.0/24, node: db, ingress: "sg-api→5432"}
    allowed: ["client→edge→api mTLS", "api identity→db:5432"]
    denied: ["Internet→app", "edge→db", "unidentified→api"]

# 3. INTERACTIVE LAB SPECIFICATION

**Lab Identifier:** lab-06-policy-as-code

**Fuente del diseño de laboratorio:** SD, cap. 4; ZTN, cap. 2.

**Objetivo Práctico:** verificar matriz de segmentación antes de aplicarla; no crea recursos/factura.

**Topología del Entorno:** Linux Bash; contrato CI transferible a IaC/CLI cloud.

**Setup Script (Bash / Go):**

    set -euo pipefail
    mkdir -p .lab-06
    printf '%s\n' \
      'source	destination	protocol	port	identity' \
      'edge	api	tcp	8443	edge-gateway' \
      'api	database	tcp	5432	spiffe://learn/ns/prod/sa/api' >.lab-06/allowed-flows.tsv

**Hands-On Walkthrough:**

1. column -t -s $'\t' .lab-06/allowed-flows.tsv muestra sólo api→database:5432.
2. Inserte edge→database tcp/5432; verificador falla.
3. Traducción cloud debe referenciar SG, no 0.0.0.0/0. Identity no sustituye mTLS/SVID.

**Definición de Terminado (DoD) & Verification Script:**

    #!/usr/bin/env bash
    set -euo pipefail
    f=.lab-06/allowed-flows.tsv
    test "$(wc -l <"$f")" -eq 3
    awk -F '\t' 'NR>1 && $1=="edge" && $2=="database" {found=1} END {exit found}' "$f"
    awk -F '\t' 'NR>1 && $5=="" {exit 1}' "$f"
    grep -qx $'api\tdatabase\ttcp\t5432\tspiffe://learn/ns/prod/sa/api' "$f"
    echo PASS-lab-06

# 4. GOTCHAS & PRODUCTION PITFALLS

- SG por CIDR amplio delega trust a topología; prefiera workload→workload. [SD, cap. 4; ZTN, caps. 1–2]
- NACL sin puertos efímeros rompe retorno; allow-all elimina límite. [SD, cap. 4]
- Bastion sin MFA/auditoría es bypass permanente. [SD, cap. 4]
- Endpoint privado no sustituye authn/authz/rotación. [ZTN, cap. 2]
