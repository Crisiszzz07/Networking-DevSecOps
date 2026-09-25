// Minimal IPv4/CIDR helpers — enough to decide containment and shared segments.

export type Cidr = { ip: number; prefix: number | null };

export function ipToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const v = Number(p);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n >>> 0;
}

export function intToIp(n: number): string {
  return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
}

export function parseCidr(value: string): Cidr | null {
  const [addr, prefix] = value.trim().split("/");
  const ip = addr ? ipToInt(addr) : null;
  if (ip === null) return null;
  if (prefix === undefined) return { ip, prefix: null };
  const p = Number(prefix);
  if (!Number.isInteger(p) || p < 0 || p > 32) return null;
  return { ip, prefix: p };
}

function mask(prefix: number): number {
  return prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
}

export function networkOf(c: Cidr): string | null {
  if (c.prefix === null) return null;
  return `${intToIp((c.ip & mask(c.prefix)) >>> 0)}/${c.prefix}`;
}

export function contains(range: Cidr, ip: number): boolean {
  if (range.prefix === null) return false;
  const m = mask(range.prefix);
  return ((range.ip & m) >>> 0) === ((ip & m) >>> 0);
}

export function addressCount(prefix: number): number {
  return 2 ** (32 - prefix);
}
