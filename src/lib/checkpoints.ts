export type CheckpointOption = {
  id: string;
  label: string;
  correct: boolean;
  feedback: string;
};

export type DecisionCheckpointSpec = {
  id: string;
  eyebrow: string;
  title: string;
  prompt: string;
  observation: string[];
  question: string;
  options: CheckpointOption[];
  evidence: string[];
  takeaway: string;
  source: string;
};

/** Content-owned catalogue: every module contributes one evidence-first decision. */
const CHECKPOINTS: Record<string, DecisionCheckpointSpec> = {
  "modulo-01": {
    id: "m01-syn-without-return",
    eyebrow: "Checkpoint 01 · predice antes de revelar",
    title: "Un SYN que no vuelve no identifica por sí solo al culpable",
    prompt:
      "Capturas en el namespace del cliente tres SYN hacia TCP/8080. No observas ningún paquete de retorno durante el intervalo de captura.",
    observation: [
      "10.44.0.2.40000 > 10.45.0.2.8080: Flags [S], seq 1000",
      "10.44.0.2.40000 > 10.45.0.2.8080: Flags [S], seq 1000 (retransmisión)",
      "10.44.0.2.40000 > 10.45.0.2.8080: Flags [S], seq 1000 (retransmisión)",
    ],
    question: "¿Cuál es la conclusión técnicamente defendible con esta evidencia?",
    options: [
      {
        id: "closed",
        label: "El host remoto está alcanzable, pero TCP/8080 está cerrado.",
        correct: false,
        feedback:
          "Un puerto cerrado normalmente responde con RST. La ausencia de retorno no demuestra que el SYN haya alcanzado el host ni el listener.",
      },
      {
        id: "bounded",
        label: "Sólo se prueba que el cliente emitió SYN; falta evidencia para localizar la pérdida o el filtrado.",
        correct: true,
        feedback:
          "Correcto. El síntoma es compatible con DROP, fallo de ruta, host inaccesible o una respuesta que no vuelve. La captura de un único punto limita la conclusión.",
      },
      {
        id: "server",
        label: "La aplicación remota aceptó la conexión y luego agotó su ventana TCP.",
        correct: false,
        feedback:
          "Una ventana cero ocurre después de que exista una sesión TCP. Aquí no hay SYN-ACK ni ACK final que demuestren que el handshake empezó a completarse.",
      },
    ],
    evidence: [
      "El SYN conserva SEQ=1000: el cliente está retransmitiendo la misma apertura, no enviando una sesión nueva.",
      "RST sería evidencia de un stack TCP alcanzable y un puerto cerrado; SYN-ACK demostraría que el servidor recibió y aceptó la apertura.",
      "Para acotar el incidente, captura primero en el router y después en la interfaz o veth del servidor antes de atribuirlo a una regla de firewall.",
    ],
    takeaway:
      "La evidencia de red se interpreta por punto de observación: una ausencia en el cliente no equivale a una decisión identificada en el servidor.",
    source: "El SYN, SYN-ACK, RST y las retransmisiones permiten separar hipótesis, pero una captura aislada no localiza el descarte. [PPA, cap. 6]",
  },
  "modulo-02": {
    id: "m02-bridge-is-not-forward",
    eyebrow: "Checkpoint 02 · predice antes de revelar",
    title: "Un bridge no convierte FORWARD en una política L2",
    prompt:
      "Dos namespaces están conectados a puertos distintos del mismo Linux bridge y comparten subred. La FDB ya conoce la MAC del destino. Una política IP en FORWARD del host dice DROP, pero el tráfico entre ambos sigue llegando.",
    observation: [
      "br-ln2-api: FDB aa:bb:cc:dd:ee:02 dev veth-api",
      "worker → bridge: dst aa:bb:cc:dd:ee:02, ethertype IPv4",
      "api recibe el frame; contador de la cadena FORWARD no aumenta",
    ],
    question: "¿Qué explicación debe guiar la corrección?",
    options: [
      {
        id: "conntrack",
        label: "Conntrack aceptó una conexión ESTABLISHED y anuló forzosamente la política FORWARD.",
        correct: false,
        feedback:
          "Conntrack no hace que un frame L2 local atraviese FORWARD. Primero hay que identificar si el camino fue puenteado o enrutado.",
      },
      {
        id: "bridge",
        label: "El bridge reenvió por MAC dentro del dominio L2; ese camino puede no recorrer FORWARD.",
        correct: true,
        feedback:
          "Correcto. Bridge decide por FDB/MAC. Si la segmentación depende de una cadena IP de forwarding, hay que comprobar que el flujo realmente sea L3 o aplicar enforcement en la frontera adecuada.",
      },
      {
        id: "masquerade",
        label: "MASQUERADE ocultó el origen y por eso la regla no puede contar el paquete.",
        correct: false,
        feedback:
          "MASQUERADE es SNAT y aparece en un camino de routing/NAT; no explica que la FDB haya reenviado un frame entre puertos locales del mismo bridge.",
      },
    ],
    evidence: [
      "La FDB contiene la MAC destino y el contador de FORWARD permanece inmóvil: son señales de forwarding L2, no de routing IP.",
      "Captura en ambos extremos del veth y en el bridge para comprobar MAC origen/destino y dónde deja de aparecer el paquete.",
      "Corrige separando dominios L2 o aplicando la política en bridge/CNI; no des por cubierto el lateral sólo porque exista una regla FORWARD.",
    ],
    takeaway:
      "La ubicación del enforcement debe coincidir con la capa por la que realmente cruza el flujo.",
    source: "Netns, veth y bridge exponen fronteras kernel distintas; bridge aprende MAC y reenvía L2, mientras Netfilter depende del camino elegido. [N&K, caps. 2–3]",
  },
  "modulo-03": {
    id: "m03-dns-is-not-identity",
    eyebrow: "Checkpoint 03 · predice antes de revelar",
    title: "DNS correcto no autentica al peer TLS",
    prompt:
      "El resolver interno responde api.internal → 10.60.0.20. El cliente abre TLS con SNI api.internal, pero el certificado recibido tiene como SAN sólo payments.internal.",
    observation: [
      "DNS: RCODE=NOERROR, A api.internal 10.60.0.20, TTL 30",
      "ClientHello: SNI=api.internal, ALPN=h2",
      "Certificate: DNS:payments.internal; no SAN DNS:api.internal",
    ],
    question: "¿Qué decisión preserva el modelo Zero Trust?",
    options: [
      {
        id: "accept-private",
        label: "Aceptar: la IP procede del DNS interno y el certificado pertenece a una CA confiable.",
        correct: false,
        feedback:
          "Un resolver interno y una cadena confiable no sustituyen la validación de identidad esperada. El nombre solicitado debe coincidir con el SAN autorizado.",
      },
      {
        id: "reject-name",
        label: "Rechazar: el nombre DNS dirigió la conexión, pero el certificado no prueba identidad para api.internal.",
        correct: true,
        feedback:
          "Correcto. DNS resuelve una ruta hacia una IP; TLS autentica el peer. Debe validarse cadena, tiempo, uso de clave y SAN/hostname o identidad de workload esperada.",
      },
      {
        id: "retry-public",
        label: "Reintentar contra un resolver público para confirmar que api.internal no fue manipulado.",
        correct: false,
        feedback:
          "Cambiar de resolver puede sacar tráfico de la frontera prevista y sigue sin validar al peer TLS. La discrepancia de SAN es la evidencia decisiva.",
      },
    ],
    evidence: [
      "El A record prueba la resolución, no quién controla la clave privada del endpoint.",
      "SNI expresa el nombre solicitado; el SAN del certificado es la identidad que el cliente debe comparar con esa expectativa.",
      "En mTLS, aplica además una política de URI SAN/SPIFFE concreta para ambos pares, no sólo una CA amplia.",
    ],
    takeaway:
      "Resolución, alcance de red e identidad criptográfica son controles diferentes; ninguno reemplaza a los otros.",
    source: "DNS comunica nombre, tipo, TTL y respuesta; TLS/X.509 debe validar la identidad esperada, y mTLS autoriza pares por identidad concreta. [PPA, cap. 8; ZTN, cap. 2]",
  },
  "modulo-04": {
    id: "m04-default-deny-needs-dns",
    eyebrow: "Checkpoint 04 · predice antes de revelar",
    title: "Default deny sin DNS rompe antes de tocar la API",
    prompt:
      "Aplicaste una NetworkPolicy con Ingress y Egress sin reglas al Pod frontend. El Service api existe y tiene endpoints sanos, pero frontend ya no puede resolver api.default.svc.cluster.local.",
    observation: [
      "kubectl get endpoints api: 10.244.2.20:8080",
      "frontend: lookup api.default.svc.cluster.local: i/o timeout",
      "NetworkPolicy frontend: policyTypes [Ingress, Egress], egress: []",
    ],
    question: "¿Cuál es el cambio mínimo y verificable?",
    options: [
      {
        id: "remove-policy",
        label: "Quitar la NetworkPolicy: un Service ClusterIP debe ser accesible automáticamente dentro del clúster.",
        correct: false,
        feedback:
          "ClusterIP estabiliza descubrimiento, no crea una excepción de autorización. Eliminar la política reabre más superficie que la necesaria.",
      },
      {
        id: "dns-egress",
        label: "Añadir egress específico a CoreDNS por UDP/TCP 53 y mantener una regla separada hacia la API autorizada.",
        correct: true,
        feedback:
          "Correcto. Default deny aplica a los Pods seleccionados. DNS es un flujo de egress explícito y TCP/53 debe contemplarse para truncado o fallback.",
      },
      {
        id: "nodeport",
        label: "Exponer api por NodePort para que frontend evite DNS y la NetworkPolicy.",
        correct: false,
        feedback:
          "NodePort amplía exposición por nodo y no evita que Egress esté denegado. Cambia el síntoma, no el control correcto.",
      },
    ],
    evidence: [
      "Endpoints sanos descartan que el selector del Service sea el primer sospechoso; el timeout ocurre antes, durante la resolución.",
      "policyTypes con Egress y una lista vacía bloquea todo egress para el Pod seleccionado hasta permitirlo expresamente.",
      "Prueba resolución y conexión por separado: consulta DNS; después TCP/8080 hacia el Service o endpoint permitido.",
    ],
    takeaway:
      "Una política de mínimo privilegio debe modelar dependencias de plataforma —como DNS— además del puerto de negocio.",
    source: "CNI debe aplicar NetworkPolicy; default deny se expresa con policyTypes y requiere reglas explícitas, incluido DNS por UDP/TCP 53. [N&K, cap. 4]",
  },
  "modulo-05": {
    id: "m05-xdp-precedes-tc",
    eyebrow: "Checkpoint 05 · predice antes de revelar",
    title: "Un DROP en XDP deja a TC sin historia que observar",
    prompt:
      "Un programa XDP adjunto a la NIC descarta paquetes TCP/8080. A la vez, un programa TC ingress en el veth intenta emitir un evento para cada conexión observada, pero no registra esos paquetes.",
    observation: [
      "bpftool net: xdp id 42 dev eth0",
      "XDP id 42: TCP dst 8080 → XDP_DROP",
      "TC ingress veth-api: contador de eventos TCP/8080 = 0",
    ],
    question: "¿Qué interpretación es correcta?",
    options: [
      {
        id: "tc-bug",
        label: "El programa TC está averiado: todo paquete IP debe llegar al hook de veth.",
        correct: false,
        feedback:
          "No todo paquete llega al veth. XDP se ejecuta en RX antes del stack; un veredicto DROP termina el recorrido antes de que TC o socket puedan observarlo.",
      },
      {
        id: "early-drop",
        label: "El DROP temprano de XDP evita el stack y por eso TC no recibe el paquete para telemetría.",
        correct: true,
        feedback:
          "Correcto. Elegir hook es elegir semántica y punto temporal. XDP es adecuado para descarte temprano; TC o socket son necesarios si se requiere contexto posterior.",
      },
      {
        id: "verifier",
        label: "El verifier eliminó el evento TC porque XDP y TC no pueden coexistir.",
        correct: false,
        feedback:
          "El verifier valida seguridad del programa; no elimina programas por tener otro hook activo. Los adjuntos pueden coexistir, pero el datapath decide qué paquetes sobreviven.",
      },
    ],
    evidence: [
      "El orden relevante es NIC RX → XDP → stack/conntrack → TC veth → socket.",
      "XDP_DROP reduce trabajo de CPU y superficie de procesamiento, pero también elimina observabilidad disponible sólo en hooks posteriores.",
      "Correlaciona el veredicto XDP con contador/mapa propio; no esperes que un sensor TC documente un paquete que nunca llegó.",
    ],
    takeaway:
      "La telemetría es parte del diseño de enforcement: un hook temprano gana coste, pero pierde contexto posterior.",
    source: "XDP se ejecuta en recepción antes del stack y puede DROP/PASS/REDIRECT; TC y socket hooks observan puntos posteriores con semántica distinta. [LeBPF, caps. 7–8]",
  },
  "modulo-06": {
    id: "m06-nacl-needs-return",
    eyebrow: "Checkpoint 06 · predice antes de revelar",
    title: "Un NACL stateless debe permitir también el retorno",
    prompt:
      "La API privada inicia una conexión a la base de datos por TCP/5432. El Security Group permite api→db:5432, pero el NACL de la subred de datos sólo permite entrada TCP/5432 y niega el resto.",
    observation: [
      "SYN api:49152 → db:5432 permitido por SG y NACL inbound",
      "SYN-ACK db:5432 → api:49152 bloqueado por NACL outbound",
      "Security Group: stateful; NACL: reglas de entrada y salida separadas",
    ],
    question: "¿Cuál es la corrección de mínimo privilegio?",
    options: [
      {
        id: "sg-only",
        label: "Eliminar el NACL: el Security Group es stateful y por tanto sustituye toda segmentación de subred.",
        correct: false,
        feedback:
          "Un SG stateful permite retorno para su propia decisión, pero no convierte un NACL existente en stateful. Si el NACL participa, debe expresar el flujo completo.",
      },
      {
        id: "return-path",
        label: "Permitir en el NACL de salida el retorno hacia el rango efímero de API, además de mantener db:5432 como destino de entrada.",
        correct: true,
        feedback:
          "Correcto. Un NACL es stateless: cada dirección se autoriza por separado. La regla debe ser acotada al CIDR y rango efímero legítimos, no abrir todo Internet.",
      },
      {
        id: "public-route",
        label: "Añadir una ruta pública temporal a la subred de datos para que SYN-ACK encuentre un camino alterno.",
        correct: false,
        feedback:
          "Una ruta pública aumenta exposición y no corrige una denegación explícita del NACL. El camino de retorno ya existe; la ACL está bloqueándolo.",
      },
    ],
    evidence: [
      "El SYN llega a 5432, así que ruta inicial, SG y NACL inbound ya no son la primera hipótesis.",
      "El SYN-ACK usa puerto origen 5432 y puerto destino efímero del cliente; el NACL evalúa esa dirección de salida por separado.",
      "Verifica ruta, SG y NACL como capas distintas, y registra la decisión junto con identidad/mTLS del workload.",
    ],
    takeaway:
      "Stateful y stateless no son sinónimos de mejor o peor: exigen pruebas de retorno y límites de responsabilidad distintos.",
    source: "Security Groups son stateful por interfaz; los NACL suelen ser stateless por subred y requieren reglas para ambos sentidos, dentro de una arquitectura de identidad y segmentación. [SD, cap. 4; ZTN, caps. 1–3]",
  },
};

export function checkpointFor(moduleId: string): DecisionCheckpointSpec | null {
  return CHECKPOINTS[moduleId] ?? null;
}

export function allCheckpoints(): DecisionCheckpointSpec[] {
  return Object.values(CHECKPOINTS);
}
