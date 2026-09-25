// The network voice of the sky: every constellation is drawn as a subnet, and
// the routes the learner draws get a codename plus a private AS number.
// Plain module so server and client code can both use it.

/** Per module (roadmap order): what travels through that constellation, with real well-known ports. */
const SIGNATURES = [
  "ipv4 · tcp · udp · icmp",
  "netns · veth · bridge · netfilter",
  "dns:53 · tls:443 · mtls",
  "cni · vxlan:4789 · nodeport:30000+",
  "xdp · tc · bpf maps",
  "vpc · security group · spiffe",
];

/** Documentation-style subnet for the constellation (10.0.N.0/24): a metaphor, not a lab address. */
export const subnetFor = (index: number) => `10.0.${index + 1}.0/24`;
export const signatureFor = (index: number) => SIGNATURES[index] ?? "unknown";

// ─── Route codenames ────────────────────────────────────────────────────────

type Noun = { es: string; g: "m" | "f" };
type Adj = { m: string; f: string };

const NOUNS: Noun[] = [
  { es: "Halcón", g: "m" },
  { es: "Garza", g: "f" },
  { es: "Lobo", g: "m" },
  { es: "Zorro", g: "m" },
  { es: "Cuervo", g: "m" },
  { es: "Faro", g: "m" },
  { es: "Puente", g: "m" },
  { es: "Centinela", g: "m" },
  { es: "Colmena", g: "f" },
  { es: "Mantis", g: "f" },
  { es: "Araña", g: "f" },
  { es: "Lince", g: "m" },
  { es: "Orca", g: "f" },
  { es: "Víbora", g: "f" },
  { es: "Cometa", g: "m" },
  { es: "Enjambre", g: "m" },
];

const ADJS: Adj[] = [
  { m: "Silencioso", f: "Silenciosa" },
  { m: "Nocturno", f: "Nocturna" },
  { m: "Cifrado", f: "Cifrada" },
  { m: "Errante", f: "Errante" },
  { m: "Vigilante", f: "Vigilante" },
  { m: "Oculto", f: "Oculta" },
  { m: "Efímero", f: "Efímera" },
  { m: "Persistente", f: "Persistente" },
  { m: "Fantasma", f: "Fantasma" },
  { m: "Rojo", f: "Roja" },
  { m: "Latente", f: "Latente" },
  { m: "Espejo", f: "Espejo" },
];

/** A codename like "Halcón Cifrado" and a private AS number (RFC 6996 range 64512–65534). */
export function routeName(rand: () => number = Math.random): { name: string; asn: string } {
  const n = NOUNS[Math.floor(rand() * NOUNS.length)]!;
  const a = ADJS[Math.floor(rand() * ADJS.length)]!;
  return { name: `${n.es} ${n.g === "m" ? a.m : a.f}`, asn: `AS${64512 + Math.floor(rand() * 1023)}` };
}
