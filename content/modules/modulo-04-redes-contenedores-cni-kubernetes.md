---
id: "modulo-04"
slug: "redes-contenedores-cni-kubernetes"
title: "Redes de Contenedores y CNI en Kubernetes"
layer: "K8s"
primary_books:
  - title: "Networking and Kubernetes: A Layered Approach"
    chapters: ["Capítulo 3: Container Networking Basics", "Capítulo 4: Kubernetes Networking Introduction", "Capítulo 5: Kubernetes Networking Abstractions"]
    target_competencies: ["Explicar IP por Pod, CNI, kube-proxy y Services.", "Aplicar default deny."]
content_version: 2
lab_runtime: "kind/k3s, kubectl, CNI con NetworkPolicy"
---
# 1. CORE MECHANICS & DEEP THEORY

> Trazabilidad: Networking and Kubernetes (N&K), caps. 3–5.

## El problema: “el Pod tiene IP” no explica por qué el flujo funciona

En los módulos anteriores seguiste un paquete por Linux y validaste una identidad TLS. Kubernetes añade otra capa de abstracción: un Pod puede cambiar de IP, un Service puede tener una IP virtual sin endpoints sanos y una NetworkPolicy puede existir sin que el CNI la aplique. Cuando un frontend no llega a una API, “revisa la red de Kubernetes” no es un diagnóstico. [N&K, caps. 3–5]

Aquí aprenderás a construir una explicación por planos: “el nombre resolvió el ClusterIP; kube-proxy eligió este endpoint; el CNI llevó el paquete al Pod remoto; la policy permitió o negó este puerto”. Esa secuencia conecta cada objeto de Kubernetes con una evidencia verificable.

## Mapa mínimo: del Pod al Service y de vuelta al Pod

    frontend Pod
       │ IP de Pod + namespace de red
       ▼
    DNS / Service ── nombre → ClusterIP estable
       │
       ▼
    kube-proxy ── DNAT hacia un endpoint real
       │
       ▼
    CNI ── ruta directa u overlay VXLAN entre nodos
       │
       ▼
    api Pod ── NetworkPolicy/CNI decide el flujo

Un Service ayuda a descubrir y balancear; no cifra, no autentica y no abre una excepción de firewall. Una NetworkPolicy define intención, pero sólo es control efectivo cuando el CNI correspondiente la aplica. [N&K, caps. 4–5]

## Ruta de estudio y conexión con el roadmap

1. Distingue IP de Pod, ClusterIP y NodePort; cada una responde a una necesidad distinta.
2. Sigue una conexión desde Service hasta EndpointSlice y Pod.
3. Compara overlay VXLAN con routing directo para entender MTU y rutas.
4. Empieza con default deny y abre DNS más el flujo de negocio mínimo.

El módulo siguiente desciende otro nivel: si el datapath de Kubernetes no es suficiente para ver o controlar un comportamiento, eBPF permite observarlo y aplicar decisiones dentro del kernel.

## Referencia técnica: modelo de red Kubernetes

Cada Pod tiene IP alcanzable y sus contenedores comparten network namespace. CNI provisiona interfaz, IP, ruta e IPAM. VXLAN encapsula L3 del Pod sobre underlay y reduce MTU; direct routing instala rutas a Pod CIDR y exige underlay alcanzable. [N&K, caps. 3–4]

ClusterIP es VIP estable; kube-proxy la redirige a Endpoints/EndpointSlices por iptables/IPVS. NodePort abre puerto por nodo. Service no es identidad, cifrado ni autorización. [N&K, caps. 4–5]

NetworkPolicy exige CNI con enforcement. policyTypes Ingress+Egress sin reglas es default deny de pods seleccionados; añada selector+puerto+protocolo. DNS necesita egress UDP/TCP 53. Selector vacío cubre namespace completo. [N&K, cap. 4]

| Plano | Identificador | Riesgo |
|---|---|---|
| Pod | IP efímera + labels | policy IP mutable |
| Service | ClusterIP/puerto | VIP no firewall |
| Node | NodePort | exposición por nodo |
| CNI | rutas/enforcement | asumir policy activa |


## La IP del Pod no es una abstracción decorativa

Cada Pod tiene IP alcanzable y CNI provisiona veth, dirección, ruta e IPAM. VXLAN encapsula IP-pod/TCP dentro de IP-nodo/UDP/VXLAN y reduce MTU; direct routing evita overhead pero exige rutas y anti-spoofing correctos en underlay. [N&K, caps. 3–4]

    [eth][IP nodo A][UDP 4789][VXLAN][eth][IP pod A][TCP][payload]
                                        └─ MTU útil para payload disminuye

| Elección | Ventaja | Coste a observar |
|---|---|---|
| VXLAN overlay | underlay ignora Pod CIDR | MTU, CPU, encapsulación |
| direct routing | menos overhead | rutas del underlay |
| eBPF datapath | evita cadenas iptables largas | nuevo punto de policy |
| IPVS | selección eficiente Service | inspección IPVS/conntrack |

## Service no equivale a conexión directa

ClusterIP estabiliza descubrimiento. Frontend usa 10.96.12.34:80; kube-proxy selecciona endpoint y DNAT hacia 10.244.2.20:8080. Service con selector correcto pero endpoints vacíos parece fallo de red, pero es descubrimiento/readiness. [N&K, caps. 4–5]

    frontend → ClusterIP:80 → kube-proxy DNAT → api Pod:8080
                                              └─ CNI ruta/overlay/direct

NetworkPolicy es aditiva: conjunto permitido es unión de reglas que seleccionan Pod; no hay deny de prioridad superior. Empiece con aislamiento y abra selector+puerto+protocolo. [N&K, cap. 4]

| Síntoma | Plano primero | Evidencia |
|---|---|---|
| Service resuelve, timeout | endpoints/policy | EndpointSlice, labels, contador CNI |
| local funciona, remoto falla | CNI/MTU/ruta | Pod CIDR, VXLAN, capture nodo |
| NodePort expuesto | borde nodo | reglas/listener/firewall cloud |
| Pod no entra a Service | control plane | probe/readiness/selector |

# 2. SCHEMATIC & TOPOLOGY BLUEPRINTS

**Fuente del blueprint:** N&K, caps. 4–5.

    nodes:
      node_a: {pod_cidr: 10.244.1.0/24}
      node_b: {pod_cidr: 10.244.2.0/24}
      frontend: {ip: 10.244.1.10, labels: {app: frontend}}
      api: {ip: 10.244.2.20, labels: {app: api}, port: 8080}
      service: {type: ClusterIP, ip: 10.96.12.34, target_port: 8080}
    flow: "frontend→ClusterIP→kube-proxy DNAT→api; VXLAN/direct route"
    enforcement: "CNI egress frontend and ingress api"

# 3. INTERACTIVE LAB SPECIFICATION

**Lab Identifier:** lab-04-k8s-default-deny

**Fuente del diseño de laboratorio:** N&K, cap. 4.

**Objetivo Práctico:** aislar namespace y permitir sólo frontend→api:8080.

**Topología del Entorno:** kind/k3s con Calico/Cilium. No kindnet para probar policy.

**Setup Script (Bash / Go):**

    set -euo pipefail
    kubectl create ns lab04 --dry-run=client -o yaml | kubectl apply -f -
    kubectl -n lab04 run api --image=hashicorp/http-echo --port=8080 -- -listen=:8080 -text=ok
    kubectl -n lab04 expose pod api --name=api --port=8080 --target-port=8080
    kubectl -n lab04 run frontend --image=busybox:1.36 -- sleep 36000
    kubectl -n lab04 wait --for=condition=Ready pod/api pod/frontend --timeout=120s
    kubectl -n lab04 apply -f - <<'YAML'
    apiVersion: networking.k8s.io/v1
    kind: NetworkPolicy
    metadata: {name: default-deny, namespace: lab04}
    spec: {podSelector: {}, policyTypes: [Ingress, Egress]}
    YAML

**Hands-On Walkthrough:**

1. kubectl -n lab04 exec frontend -- wget -T 2 -qO- http://api:8080 falla porque DNS está bloqueado.
2. Añada estas policies tras inspeccionar los labels reales. Sustituya kube-system/k8s-app=kube-dns si su CNI usa otra etiqueta:

       kubectl -n lab04 apply -f - <<'YAML'
       apiVersion: networking.k8s.io/v1
       kind: NetworkPolicy
       metadata: {name: allow-frontend, namespace: lab04}
       spec:
         podSelector: {matchLabels: {run: frontend}}
         policyTypes: [Egress]
         egress:
         - to: [{namespaceSelector: {matchLabels: {kubernetes.io/metadata.name: kube-system}}, podSelector: {matchLabels: {k8s-app: kube-dns}}}]
           ports: [{protocol: UDP, port: 53}, {protocol: TCP, port: 53}]
         - to: [{podSelector: {matchLabels: {run: api}}}]
           ports: [{protocol: TCP, port: 8080}]
       ---
       apiVersion: networking.k8s.io/v1
       kind: NetworkPolicy
       metadata: {name: allow-api-from-frontend, namespace: lab04}
       spec:
         podSelector: {matchLabels: {run: api}}
         policyTypes: [Ingress]
         ingress:
         - from: [{podSelector: {matchLabels: {run: frontend}}}]
           ports: [{protocol: TCP, port: 8080}]
       YAML

3. Salida esperada exacta de wget: ok. Describe muestra intención; timeout/success verifica enforcement.

**Definición de Terminado (DoD) & Verification Script:**

    #!/usr/bin/env bash
    set -euo pipefail
    kubectl -n lab04 exec frontend -- wget -T 3 -qO- http://api:8080 | grep -qx ok
    kubectl -n lab04 get networkpolicy default-deny -o jsonpath='{.spec.policyTypes}' | grep -q Ingress
    kubectl -n lab04 get networkpolicy default-deny -o jsonpath='{.spec.policyTypes}' | grep -q Egress
    echo PASS-lab-04

# 4. GOTCHAS & PRODUCTION PITFALLS

- Sin CNI compatible, NetworkPolicy no tiene enforcement. [N&K, cap. 4]
- MTU VXLAN mal alineado produce fallos grandes/intermitentes. [N&K, caps. 3–4]
- NodePort aumenta superficie. [N&K, cap. 5]
