import type { Metadata, Viewport } from "next";
import { Chakra_Petch, IBM_Plex_Sans, JetBrains_Mono } from "next/font/google";
import Link from "next/link";
import { ContinueLink } from "@/components/hallmark/ContinueLink";
import { NetworkLogo } from "@/components/hallmark/NetworkLogo";
import { loadModules, summarise } from "@/lib/content";
import "@/styles/globals.css";

const chakra = Chakra_Petch({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-chakra", display: "swap" });
const plex = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "600"], variable: "--font-plex", display: "swap" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "600"], variable: "--font-jetbrains", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Redes para DevSecOps", template: "%s · Redes para DevSecOps" },
  description: "Roadmap de laboratorios de redes para DevSecOps y arquitectura de ciberseguridad: del paquete IPv4 a Zero Trust.",
};

export const viewport: Viewport = { themeColor: "oklch(13.5% 0.055 292)", colorScheme: "dark" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const summaries = loadModules().map(summarise);
  return (
    <html lang="es" className={`${chakra.variable} ${plex.variable} ${jetbrains.variable}`}>
      <body>
        <a href="#main" className="btn btn-xs sr-only focus:not-sr-only focus:fixed focus:left-md focus:top-md focus:z-50">
          Saltar al contenido
        </a>
        <header className="site-header flex items-center justify-between gap-md px-gutter py-md">
          <Link href="/" className="brand" aria-label="Redes para DevSecOps: inicio">
            <NetworkLogo />
            <span className="brand-text">
              <span className="brand-name">
                redes<span className="brand-slash">/</span>devsecops
              </span>
              <span className="brand-sub">mapa estelar de red</span>
            </span>
          </Link>
          <ContinueLink modules={summaries} />
        </header>
        <main id="main">{children}</main>
        <footer className="site-footer mx-gutter mt-3xl">
          <p className="orn-rule w-full" aria-hidden>
            ◇
          </p>
          <div className="flex flex-wrap justify-center gap-x-lg gap-y-xs label-mono">
            <span>{summaries.length} módulos curados en content/modules</span>
            <span>Progreso y asterismos guardados sólo en este navegador</span>
            <span>Verificador local: tools/verifier (Go)</span>
          </div>
          <p className="footer-motto">
            <span className="tok-prompt">$ </span>traceroute --hasta=zero-trust
          </p>
        </footer>
      </body>
    </html>
  );
}
