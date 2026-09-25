/**
 * The product mark is a packet trace: three inspected hops, one routed packet,
 * and an octagonal boundary that hints at an isolated network domain.
 */
export function NetworkLogo() {
  return (
    <svg className="brand-mark" viewBox="0 0 48 48" aria-hidden="true">
      <path className="brand-frame" d="M12 4h20l12 12v16L32 44H12L4 36V12z" />
      <path className="brand-grid" d="M8 24h32M24 8v32" />
      <path className="brand-route" d="M9 32 18 23l8 6 13-14" />
      <path className="brand-route brand-route-echo" d="M9 32 18 23l8 6" />
      <circle className="brand-hop" cx="9" cy="32" r="2.4" />
      <circle className="brand-hop" cx="18" cy="23" r="2.4" />
      <circle className="brand-packet" cx="26" cy="29" r="3.4" />
      <circle className="brand-hop" cx="39" cy="15" r="2.4" />
      <path className="brand-arrow" d="m35.5 15 3.5-3.5 1.5 5z" />
    </svg>
  );
}
