import { intToIp, parseCidr } from "./cidr";
import type { CapturePoint, HeaderName, PacketField, PacketTrace, Topology, TopoNode } from "./types";

// Synthesises the first packet of a module's primary flow from the blueprint's own
// addresses and ports, then replays what the path does to it: TTL decrement and
// checksum recomputation at each forwarding hop, destination rewrite at a DNAT
// stage. Values the blueprint does not pin down are listed as assumptions.

type Proto = "tcp" | "udp";

type FieldDef = { key: string; label: string; bits: number; format?: (v: number) => string };

const hex = (v: number, w: number) => "0x" + v.toString(16).padStart(w, "0");

const IPV4: FieldDef[] = [
  { key: "ip.version", label: "Version", bits: 4 },
  { key: "ip.ihl", label: "IHL", bits: 4, format: (v) => `${v} · ${v * 4} bytes` },
  { key: "ip.dscp", label: "DSCP/ECN", bits: 8, format: (v) => hex(v, 2) },
  { key: "ip.len", label: "Total Length", bits: 16, format: (v) => `${v} bytes` },
  { key: "ip.id", label: "Identification", bits: 16, format: (v) => hex(v, 4) },
  { key: "ip.flags", label: "Flags", bits: 3, format: (v) => [v & 2 ? "DF" : null, v & 1 ? "MF" : null].filter(Boolean).join(" ") || "—" },
  { key: "ip.frag", label: "Fragment Offset", bits: 13 },
  { key: "ip.ttl", label: "TTL", bits: 8 },
  { key: "ip.proto", label: "Protocol", bits: 8, format: (v) => `${v} · ${({ 1: "ICMP", 6: "TCP", 17: "UDP" } as Record<number, string>)[v] ?? "?"}` },
  { key: "ip.csum", label: "Header Checksum", bits: 16, format: (v) => hex(v, 4) },
  { key: "ip.src", label: "Source Address", bits: 32, format: (v) => intToIp(v) },
  { key: "ip.dst", label: "Destination Address", bits: 32, format: (v) => intToIp(v) },
];

const TCP_FLAGS = ["FIN", "SYN", "RST", "PSH", "ACK", "URG", "ECE", "CWR"];

const TCP: FieldDef[] = [
  { key: "tcp.sport", label: "Source Port", bits: 16 },
  { key: "tcp.dport", label: "Destination Port", bits: 16 },
  { key: "tcp.seq", label: "Sequence Number", bits: 32 },
  { key: "tcp.ack", label: "Acknowledgment Number", bits: 32 },
  { key: "tcp.off", label: "Data Offset", bits: 4, format: (v) => `${v} · ${v * 4} bytes` },
  { key: "tcp.rsv", label: "Reserved", bits: 4 },
  { key: "tcp.flags", label: "Flags", bits: 8, format: (v) => TCP_FLAGS.filter((_, i) => v & (1 << i)).join(" ") || "—" },
  { key: "tcp.win", label: "Window", bits: 16 },
  { key: "tcp.csum", label: "Checksum", bits: 16, format: (v) => hex(v, 4) },
  { key: "tcp.urg", label: "Urgent Pointer", bits: 16 },
];

const UDP: FieldDef[] = [
  { key: "udp.sport", label: "Source Port", bits: 16 },
  { key: "udp.dport", label: "Destination Port", bits: 16 },
  { key: "udp.len", label: "Length", bits: 16, format: (v) => `${v} bytes` },
  { key: "udp.csum", label: "Checksum", bits: 16, format: (v) => hex(v, 4) },
];

const DNS_HDR: FieldDef[] = [
  { key: "dns.id", label: "Transaction ID", bits: 16, format: (v) => hex(v, 4) },
  { key: "dns.qr", label: "QR", bits: 1, format: (v) => (v ? "1 · respuesta" : "0 · consulta") },
  { key: "dns.opcode", label: "Opcode", bits: 4 },
  { key: "dns.aa", label: "AA", bits: 1 },
  { key: "dns.tc", label: "TC", bits: 1 },
  { key: "dns.rd", label: "RD", bits: 1 },
  { key: "dns.ra", label: "RA", bits: 1 },
  { key: "dns.z", label: "Z", bits: 3 },
  { key: "dns.rcode", label: "RCODE", bits: 4 },
  { key: "dns.qd", label: "QDCOUNT", bits: 16 },
  { key: "dns.an", label: "ANCOUNT", bits: 16 },
  { key: "dns.ns", label: "NSCOUNT", bits: 16 },
  { key: "dns.ar", label: "ARCOUNT", bits: 16 },
];

export const FIELD_DOCS: Record<string, { what: string; security?: string }> = {
  "ip.version": { what: "Versión del protocolo IP; 4 para IPv4." },
  "ip.ihl": { what: "Longitud de cabecera en palabras de 32 bits. Con 5 no hay opciones y L4 empieza en el byte 20.", security: "Un IHL inconsistente es la forma de desalinear parsers que calculan mal dónde empieza TCP." },
  "ip.dscp": { what: "Clase de servicio (DSCP) y notificación explícita de congestión (ECN)." },
  "ip.len": { what: "Longitud total del datagrama: cabecera IP + L4 + datos." },
  "ip.id": { what: "Identificador para reensamblar fragmentos del mismo datagrama." },
  "ip.flags": { what: "DF prohíbe fragmentar; MF indica que quedan fragmentos.", security: "Los fragmentos posteriores al primero no llevan cabecera TCP: una ACL por puerto que no reensambla no los ve." },
  "ip.frag": { what: "Posición del fragmento en unidades de 8 bytes." },
  "ip.ttl": { what: "Saltos restantes. Cada router lo decrementa; en 0 descarta y emite ICMP Time Exceeded.", security: "Cambia en cada salto: por eso el checksum IP se recalcula en cada router." },
  "ip.proto": { what: "Protocolo de la carga: TCP=6, UDP=17, ICMP=1.", security: "Una ACL sólo-TCP deja UDP e ICMP sin política." },
  "ip.csum": { what: "Checksum de complemento a uno sobre la cabecera IP. Se recalcula cuando cambian TTL, NAT o cualquier campo.", security: "En capturas del propio host puede aparecer «incorrecto» por checksum offload; valide desde el peer." },
  "ip.src": { what: "Dirección origen.", security: "En una red permisiva se puede falsificar: CIDR expresa alcance, no autorización." },
  "ip.dst": { what: "Dirección destino; la ruta se elige por longest-prefix match sobre este campo." },
  "tcp.sport": { what: "Puerto origen, normalmente efímero en el cliente." },
  "tcp.dport": { what: "Puerto destino del servicio." },
  "tcp.seq": { what: "Número de secuencia del primer byte. SYN y FIN consumen una unidad." },
  "tcp.ack": { what: "Siguiente byte esperado del peer; válido cuando ACK=1." },
  "tcp.off": { what: "Tamaño de la cabecera TCP en palabras de 32 bits." },
  "tcp.rsv": { what: "Bits reservados." },
  "tcp.flags": { what: "SYN abre, ACK confirma, FIN cierra una dirección, RST aborta el estado.", security: "Timeout sin SYN-ACK es compatible con DROP; un RST prueba que el stack es alcanzable sin listener." },
  "tcp.win": { what: "Ventana de recepción anunciada (bytes, antes de escalado)." },
  "tcp.csum": { what: "Checksum sobre pseudo-cabecera IP + segmento TCP. Cambia si NAT reescribe direcciones o puertos." },
  "tcp.urg": { what: "Puntero urgente; sólo significativo con URG=1." },
  "udp.sport": { what: "Puerto origen." },
  "udp.dport": { what: "Puerto destino; 53 para DNS." },
  "udp.len": { what: "Cabecera UDP (8 bytes) + datos." },
  "udp.csum": { what: "Checksum sobre pseudo-cabecera IP + datagrama. Opcional en IPv4 (0 = ausente)." },
  "dns.id": { what: "Identificador que empareja consulta y respuesta.", security: "Un ID predecible facilita el envenenamiento de caché." },
  "dns.qr": { what: "0 consulta, 1 respuesta." },
  "dns.opcode": { what: "Tipo de operación; 0 = consulta estándar." },
  "dns.aa": { what: "Respuesta autoritativa." },
  "dns.tc": { what: "Respuesta truncada.", security: "TC=1 exige reintentar por TCP/53: un egress sólo-UDP rompe la resolución." },
  "dns.rd": { what: "Recursión deseada por el cliente." },
  "dns.ra": { what: "Recursión disponible en el servidor." },
  "dns.z": { what: "Reservado." },
  "dns.rcode": { what: "Código de resultado: 0 NOERROR, 2 SERVFAIL, 3 NXDOMAIN." },
  "dns.qd": { what: "Número de preguntas." },
  "dns.an": { what: "Número de respuestas." },
  "dns.ns": { what: "Registros de autoridad." },
  "dns.ar": { what: "Registros adicionales." },
  "dns.qname": { what: "Nombre consultado en formato de etiquetas (longitud + bytes)." },
  "dns.qtype": { what: "Tipo de registro pedido: A=1, AAAA=28, SRV=33, TXT=16." },
  "dns.qclass": { what: "Clase; IN=1." },
};

// ─── Byte writer ────────────────────────────────────────────────────────────

class Bits {
  bytes: number[] = [];
  private bit = 0;
  fields: PacketField[] = [];
  write(def: FieldDef, value: number, header: HeaderName) {
    this.fields.push({
      key: def.key,
      label: def.label,
      header,
      bitOffset: this.bit,
      bitLength: def.bits,
      raw: value >>> 0,
      value: def.format ? def.format(value >>> 0) : String(value >>> 0),
      changed: false,
    });
    for (let i = def.bits - 1; i >= 0; i--) {
      const byte = this.bit >> 3;
      if (this.bytes.length <= byte) this.bytes.push(0);
      if (Math.floor(value / 2 ** i) % 2) this.bytes[byte]! |= 0x80 >> (this.bit & 7);
      this.bit++;
    }
  }
  raw(key: string, label: string, header: HeaderName, data: number[], value: string) {
    this.fields.push({ key, label, header, bitOffset: this.bit, bitLength: data.length * 8, raw: 0, value, changed: false });
    this.bytes.push(...data);
    this.bit += data.length * 8;
  }
}

export function onesComplement(bytes: number[]): number {
  let sum = 0;
  for (let i = 0; i < bytes.length; i += 2) sum += (bytes[i]! << 8) + (bytes[i + 1] ?? 0);
  while (sum >> 16) sum = (sum & 0xffff) + (sum >> 16);
  return ~sum & 0xffff;
}

type Spec = {
  proto: Proto;
  src: number;
  dst: number;
  sport: number;
  dport: number;
  ttl: number;
  payload: "dns" | "none";
  qname: string | null;
  qtype: number;
};

function encodeName(name: string): number[] {
  const out: number[] = [];
  for (const label of name.split(".").filter(Boolean)) {
    out.push(label.length, ...[...label].map((c) => c.charCodeAt(0)));
  }
  out.push(0);
  return out;
}

function build(spec: Spec): { bytes: number[]; fields: PacketField[] } {
  // L4 + payload first, so IP total length and checksums can be derived.
  const l4 = new Bits();
  let payloadLen = 0;
  if (spec.proto === "tcp") {
    const v = [spec.sport, spec.dport, 0x3c1f_9a02, 0, 5, 0, 0x02, 64240, 0, 0];
    TCP.forEach((d, i) => l4.write(d, v[i]!, "TCP"));
  } else {
    const dns = new Bits();
    if (spec.payload === "dns" && spec.qname) {
      const v = [0x1a2b, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
      DNS_HDR.forEach((d, i) => dns.write(d, v[i]!, "DNS"));
      dns.raw("dns.qname", "QNAME", "DNS", encodeName(spec.qname), spec.qname);
      dns.write({ key: "dns.qtype", label: "QTYPE", bits: 16, format: (x) => `${x} · ${x === 1 ? "A" : "?"}` }, spec.qtype, "DNS");
      dns.write({ key: "dns.qclass", label: "QCLASS", bits: 16, format: (x) => `${x} · IN` }, 1, "DNS");
    }
    payloadLen = dns.bytes.length;
    const v = [spec.sport, spec.dport, 8 + payloadLen, 0];
    UDP.forEach((d, i) => l4.write(d, v[i]!, "UDP"));
    l4.bytes.push(...dns.bytes);
    l4.fields.push(...dns.fields.map((f) => ({ ...f, bitOffset: f.bitOffset + 64 })));
  }

  const ip = new Bits();
  const total = 20 + l4.bytes.length;
  const ipv = [4, 5, 0, total, 0x1c46, 0b010, 0, spec.ttl, spec.proto === "tcp" ? 6 : 17, 0, spec.src, spec.dst];
  IPV4.forEach((d, i) => ip.write(d, ipv[i]!, "IPv4"));

  const ipCsum = onesComplement(ip.bytes);
  ip.bytes[10] = ipCsum >> 8;
  ip.bytes[11] = ipCsum & 0xff;
  const csumField = ip.fields.find((f) => f.key === "ip.csum")!;
  csumField.raw = ipCsum;
  csumField.value = hex(ipCsum, 4);

  const pseudo = [...ip.bytes.slice(12, 20), 0, spec.proto === "tcp" ? 6 : 17, l4.bytes.length >> 8, l4.bytes.length & 0xff];
  const l4Csum = onesComplement([...pseudo, ...l4.bytes]) || 0xffff;
  const at = spec.proto === "tcp" ? 16 : 6;
  l4.bytes[at] = l4Csum >> 8;
  l4.bytes[at + 1] = l4Csum & 0xff;
  const l4Field = l4.fields.find((f) => f.key === `${spec.proto}.csum`)!;
  l4Field.raw = l4Csum;
  l4Field.value = hex(l4Csum, 4);

  const fields = [...ip.fields, ...l4.fields.map((f) => ({ ...f, bitOffset: f.bitOffset + 160 }))];
  return { bytes: [...ip.bytes, ...l4.bytes], fields };
}

function firstIp(n: TopoNode | undefined): number | null {
  for (const i of n?.ifaces ?? []) {
    const c = parseCidr(i.cidr);
    if (c) return c.ip;
  }
  return null;
}

function servicePort(n: TopoNode | undefined): { proto: Proto; port: number } | null {
  if (!n) return null;
  const listen = n.props.listen?.match(/^(tcp|udp)\/(\d+)$/i);
  if (listen) return { proto: listen[1]!.toLowerCase() as Proto, port: Number(listen[2]) };
  const p = n.props.port ?? n.props.target_port;
  return p ? { proto: "tcp", port: Number(p) } : null;
}

export function detectHeaders(theory: string): HeaderName[] {
  const out: HeaderName[] = [];
  if (/\bIPv4\b/.test(theory)) out.push("IPv4");
  if (/\bTCP\b/.test(theory)) out.push("TCP");
  if (/\bUDP\b/.test(theory)) out.push("UDP");
  if (/\bDNS\b/.test(theory)) out.push("DNS");
  return out;
}

export function tracePacket(topo: Topology): PacketTrace | null {
  const node = (id: string) => topo.nodes.find((n) => n.id === id);
  for (const flow of topo.flows) {
    if (flow.verdict !== "allow" || flow.hops.length < 2) continue;
    const srcNode = node(flow.hops[0]!.node);
    const dstNode = node(flow.hops[flow.hops.length - 1]!.node);
    const src = firstIp(srcNode);
    // For a DNAT flow the packet leaves addressed to the VIP (the first hop after the source).
    const dnatAt = flow.hops.findIndex((h) => h.stages.some((s) => /DNAT/i.test(s)));
    const vipNode = dnatAt > 0 ? node(flow.hops[dnatAt - 1]!.node) : dstNode;
    const dst = firstIp(vipNode);
    if (src === null || dst === null) continue;

    const assumptions: string[] = [];
    const labelPort = flow.label.match(/\b(tcp|udp)\s*\/\s*(\d+)/i);
    const svc = labelPort
      ? { proto: labelPort[1]!.toLowerCase() as Proto, port: Number(labelPort[2]) }
      : servicePort(vipNode) ?? servicePort(dstNode);
    if (!svc) continue;
    if (!labelPort && !vipNode?.props.listen) assumptions.push(`Protocolo ${svc.proto.toUpperCase()} deducido del puerto declarado en ${vipNode?.id}.`);

    const sport = srcNode?.props.source_port ? Number(srcNode.props.source_port) : 49152;
    if (!srcNode?.props.source_port) assumptions.push("Puerto origen 49152: primer puerto efímero IANA, ilustrativo.");

    const record = dstNode?.props.record?.split(" ");
    const isDns = svc.proto === "udp" && svc.port === 53;
    const spec: Spec = {
      proto: svc.proto,
      src,
      dst,
      sport,
      dport: svc.port,
      ttl: 64,
      payload: isDns ? "dns" : "none",
      qname: isDns ? (record?.[0] ?? null) : null,
      qtype: 1,
    };
    assumptions.push("TTL inicial 64 (valor por defecto de Linux); Identification 0x1c46 ilustrativo.");
    if (svc.proto === "tcp") assumptions.push("SYN sin opciones TCP para que la cabecera quepa en 20 bytes; un SYN real de Linux añade MSS, SACK, timestamps y window scale. ISN ilustrativo.");
    if (isDns) assumptions.push(`Consulta A para ${spec.qname}, tomada del registro declarado en ${dstNode?.id}. Transaction ID ilustrativo.`);

    const captures: CapturePoint[] = [];
    const push = (id: string, label: string, note: string, prev: CapturePoint | null) => {
      const { bytes, fields } = build(spec);
      if (prev) for (const f of fields) f.changed = prev.fields.find((p) => p.key === f.key)?.raw !== f.raw;
      captures.push({ id, label, note, bytes, fields });
    };
    push("origin", `Sale de ${srcNode!.label}`, `${intToIp(src)}:${sport} → ${intToIp(dst)}:${svc.port}`, null);

    flow.hops.slice(1).forEach((hop, i) => {
      const n = node(hop.node);
      if (!n) return;
      const dnat = hop.stages.find((s) => /DNAT/i.test(s));
      if (dnat) {
        const target = firstIp(n);
        const port = servicePort(n)?.port ?? spec.dport;
        if (target !== null) {
          spec.dst = target;
          spec.dport = port;
          push(`hop-${i}`, `Tras ${dnat}`, `destino reescrito a ${intToIp(target)}:${port}; checksums L3 y L4 recalculados`, captures[captures.length - 1]!);
        }
      }
      const forwards = n.kind === "router" || (n.kind === "host" && n.props.forwarding === "true");
      if (forwards && i < flow.hops.length - 2) {
        spec.ttl -= 1;
        const stages = hop.stages.length ? ` (${hop.stages.join(" → ")})` : "";
        push(`hop-${i}`, `Reenviado por ${n.label}`, `TTL − 1 y checksum IP recalculado${stages}`, captures[captures.length - 1]!);
      }
    });

    return { flowLabel: flow.label, assumptions, captures };
  }
  return null;
}
