// Curated interactive diagrams for the figures in the theory markdown.
//
// Each diagram belongs to exactly ONE figure: it is matched by the figure's first
// line (and an extra token when two figures start alike). A figure without a
// diagram is shown as-is — there is deliberately no generic fallback, so the
// same "origen → tránsito → destino" card can never repeat across modules.
// mechanisms.test.ts checks every spec hits one figure and no title repeats.

export type MechanismStep = { label: string; detail: string; signal: string };

export type Mechanism = {
  /** The figure's first non-empty line must start with this (whitespace-trimmed). */
  first: string;
  /** Optional token the figure must also contain, to tell apart figures that start alike. */
  has?: string;
  title: string;
  cue: string;
  steps: MechanismStep[];
};

export const MECHANISMS: Mechanism[] = [
  // ── M01 · paquete y transporte ──
  {
    first: "proceso cliente",
    title: "Una petición recorre varias decisiones",
    cue: "La misma solicitud cambia de contexto en cada etapa.",
    steps: [
      { label: "proceso", detail: "La aplicación pide abrir un socket hacia un host y puerto.", signal: "intención" },
      { label: "TCP", detail: "SYN, SYN-ACK, ACK o RST muestran si hubo sesión y cómo respondió el peer.", signal: "sesión" },
      { label: "IPv4", detail: "Direcciones, protocolo, TTL y tamaño describen el datagrama que sale.", signal: "paquete" },
      { label: "ruta / firewall", detail: "El kernel elige el siguiente salto y una política puede permitir o descartar.", signal: "tránsito" },
      { label: "servidor", detail: "Un listener acepta, rechaza o no llega a observar la solicitud.", signal: "respuesta" },
    ],
  },
  {
    first: "Byte:",
    title: "Los primeros cuatro bytes orientan la lectura",
    cue: "Selecciona un campo para conectar los bits con la decisión posterior.",
    steps: [
      { label: "45", detail: "0100 indica IPv4; 0101 significa IHL=5, por lo que L4 empieza en el byte 20.", signal: "versión + IHL" },
      { label: "00", detail: "DSCP/ECN transporta una clase de servicio y señal de congestión.", signal: "servicio" },
      { label: "00 3c", detail: "Total Length=60 delimita cabecera IP, transporte y carga útil.", signal: "longitud" },
    ],
  },
  {
    first: "cliente",
    has: "SYN SEQ=",
    title: "TCP confirma bytes, no paquetes",
    cue: "Las banderas y los números de secuencia distinguen apertura, datos y cierre.",
    steps: [
      { label: "SYN", detail: "El cliente propone su espacio de secuencia y opciones TCP.", signal: "apertura" },
      { label: "SYN-ACK", detail: "El servidor reserva estado, reconoce el SYN y propone su propia secuencia.", signal: "respuesta" },
      { label: "ACK", detail: "El cliente confirma el siguiente byte esperado y completa la apertura.", signal: "establecida" },
      { label: "datos / ACK", detail: "ACK=1121 confirma los 120 bytes enviados desde SEQ=1001.", signal: "progreso" },
    ],
  },

  // ── M02 · kernel ──
  {
    first: "proceso en contenedor",
    title: "Del contenedor al firewall del host",
    cue: "No hay una sola red: cada borde tiene una responsabilidad distinta.",
    steps: [
      { label: "namespace", detail: "Aísla interfaces, rutas, puertos y sockets del workload.", signal: "aislamiento" },
      { label: "veth", detail: "Transporta TX de un extremo como RX en su peer.", signal: "frontera" },
      { label: "bridge / ruta", detail: "Un bridge decide por MAC; una ruta L3 decide por prefijo IP.", signal: "camino" },
      { label: "Netfilter", detail: "PREROUTING, FORWARD y POSTROUTING pueden filtrar, marcar o traducir.", signal: "enforcement" },
    ],
  },
  {
    first: "proceso api → netns api",
    title: "El paquete cruza dos namespaces a través del host",
    cue: "api y worker no comparten red: el host une sus bridges y decide en FORWARD.",
    steps: [
      { label: "netns api", detail: "El proceso envía por eth0 (172.30.10.2/24), la interfaz dentro de su namespace.", signal: "origen" },
      { label: "veth → br-ln2-api", detail: "Lo que sale por un extremo del par veth entra por el otro, conectado al bridge de la red api.", signal: "L2" },
      { label: "ruta + FORWARD", detail: "El host enruta entre las dos subredes; la cadena FORWARD permite o descarta el tránsito.", signal: "decisión" },
      { label: "br-ln2-worker → veth", detail: "El bridge de la red worker entrega la trama al par veth de ese namespace.", signal: "L2" },
      { label: "netns worker", detail: "Solo si FORWARD lo permitió, el socket del worker ve el paquete.", signal: "entrega" },
    ],
  },

  // ── M03 · DNS, TLS, mTLS ──
  {
    first: "aplicación",
    title: "Nombre, camino e identidad",
    cue: "Resolver una IP no prueba la identidad del servicio.",
    steps: [
      { label: "aplicación", detail: "Solicita un nombre y decide el destino esperado.", signal: "intención" },
      { label: "DNS", detail: "Convierte nombre en IP e informa TTL, tipo de respuesta y RCODE.", signal: "resolución" },
      { label: "TCP", detail: "Prueba que existe un camino y que el puerto responde.", signal: "alcance" },
      { label: "TLS / mTLS", detail: "Valida SAN, cadena, tiempo e identidad de ambos peers cuando aplica.", signal: "identidad" },
    ],
  },
  {
    first: "app",
    has: "ClientHello",
    title: "TLS 1.3 con mTLS en un solo viaje de ida y vuelta",
    cue: "Cada mensaje responde a una pregunta distinta: parámetros, identidad del servidor, identidad del cliente.",
    steps: [
      { label: "ClientHello", detail: "El cliente propone versión, SNI (a qué nombre quiere hablar), ALPN y su parte del intercambio de claves (key_share).", signal: "propuesta" },
      { label: "ServerHello + Cert", detail: "El servidor completa el intercambio; desde aquí todo va cifrado. Envía su certificado y CertificateVerify, que prueba que posee la clave privada.", signal: "id servidor" },
      { label: "Cert del cliente", detail: "En mTLS el cliente también presenta certificado y CertificateVerify; Finished cierra el handshake de ambos lados.", signal: "id cliente" },
      { label: "application data", detail: "Los datos viajan con las claves de tráfico derivadas del handshake.", signal: "sesión" },
    ],
  },

  // ── M04 · Kubernetes ──
  {
    first: "frontend Pod",
    title: "Un Service conduce a un Pod real",
    cue: "El ClusterIP estabiliza descubrimiento; no es el destino final.",
    steps: [
      { label: "frontend Pod", detail: "El workload origina tráfico desde su namespace e IP de Pod.", signal: "origen" },
      { label: "DNS / Service", detail: "El nombre resuelve a un ClusterIP estable.", signal: "descubrimiento" },
      { label: "kube-proxy", detail: "Selecciona un endpoint y reescribe el destino mediante DNAT.", signal: "selección" },
      { label: "CNI", detail: "Lleva el flujo por ruta directa u overlay entre nodos.", signal: "datapath" },
      { label: "api Pod", detail: "El CNI y la NetworkPolicy determinan si el puerto está permitido.", signal: "policy" },
    ],
  },
  {
    first: "[eth][IP nodo A]",
    title: "VXLAN mete un paquete dentro de otro",
    cue: "Lee de fuera hacia dentro: la red física solo ve la capa exterior.",
    steps: [
      { label: "eth + IP nodo", detail: "Cabeceras exteriores: la red física transporta el paquete de nodo a nodo, sin conocer los Pods.", signal: "underlay" },
      { label: "UDP 4789", detail: "Puerto estándar de VXLAN; si un firewall entre nodos lo bloquea, el overlay no funciona.", signal: "túnel" },
      { label: "VXLAN", detail: "Cabecera con el VNI, el identificador de la red overlay a la que pertenece el tráfico.", signal: "overlay" },
      { label: "eth + IP pod + TCP", detail: "El paquete original del Pod, intacto, viaja como carga útil del túnel.", signal: "interior" },
      { label: "MTU", detail: "Las cabeceras extra ocupan unos 50 bytes: si la MTU del Pod no se reduce, los paquetes grandes se fragmentan o se descartan.", signal: "coste" },
    ],
  },

  // ── M05 · eBPF ──
  {
    first: "NIC recibe bytes",
    title: "El paquete gana contexto mientras avanza",
    cue: "El hook elegido determina qué puedes decidir y qué evidencia conservas.",
    steps: [
      { label: "NIC", detail: "La interfaz recibe bytes antes de que exista contexto de proceso.", signal: "RX" },
      { label: "XDP", detail: "Puede DROP, PASS o REDIRECT antes del stack con el menor coste.", signal: "temprano" },
      { label: "stack", detail: "El paquete pasa por la red normal del kernel y conntrack.", signal: "estado" },
      { label: "TC / veth", detail: "Añade contexto de interfaz, Pod y política de tránsito.", signal: "interfaz" },
      { label: "socket / cgroup", detail: "Relaciona el flujo con proceso, cgroup o una operación.", signal: "identidad" },
    ],
  },
  {
    first: "data",
    has: "data_end",
    title: "El verifier exige una prueba de límites",
    cue: "Antes de leer un campo, el programa debe demostrar que existe dentro del paquete.",
    steps: [
      { label: "data", detail: "Inicio de los bytes recibidos.", signal: "inicio" },
      { label: "cabecera", detail: "El parser avanza sólo después de comprobar su tamaño.", signal: "parseo" },
      { label: "data_end", detail: "Límite que el verifier usa para impedir lecturas fuera del paquete.", signal: "límite" },
    ],
  },

  // ── M06 · cloud y Zero Trust ──
  {
    first: "cliente",
    has: "Internet sólo hasta el borde",
    title: "Un flujo cloud atraviesa defensas distintas",
    cue: "Privado no significa confiable: cada borde limita una parte del riesgo.",
    steps: [
      { label: "edge público", detail: "Es el único borde que recibe tráfico de Internet.", signal: "ingress" },
      { label: "aplicación privada", detail: "Recibe sólo el puerto y origen mínimos desde el edge.", signal: "segmentación" },
      { label: "identidad mTLS", detail: "Autentica el workload, no sólo su dirección IP.", signal: "authn" },
      { label: "datos privados", detail: "Permanece sin ruta pública y acepta sólo el flujo autorizado.", signal: "mínimo privilegio" },
    ],
  },
  {
    first: "attestation",
    title: "La identidad del workload se emite, se presenta y se audita",
    cue: "En Zero Trust la base de datos no confía en la IP de origen, sino en una identidad verificable.",
    steps: [
      { label: "attestation", detail: "Un agente comprueba qué workload es de verdad (nodo, imagen, cuenta de servicio) antes de darle identidad.", signal: "prueba" },
      { label: "SVID", detail: "El control plane emite un SVID: una identidad SPIFFE firmada y de vida corta para ese workload.", signal: "emisión" },
      { label: "mTLS", detail: "La api presenta su SVID al conectarse a la base de datos.", signal: "presentación" },
      { label: "verificación", detail: "La base de datos comprueba emisor, SAN (el SPIFFE ID) y la política de quién puede llamar.", signal: "authz" },
      { label: "auditoría", detail: "Cada allow/deny queda registrado con su contexto para poder investigar después.", signal: "evidencia" },
    ],
  },
];

const firstLine = (source: string) => source.split("\n").find((l) => l.trim())?.trim() ?? "";

/** The curated diagram for this figure, or null: never a generic stand-in. */
export function mechanismFor(source: string): Mechanism | null {
  const head = firstLine(source);
  return MECHANISMS.find((m) => head.startsWith(m.first) && (!m.has || source.includes(m.has))) ?? null;
}
