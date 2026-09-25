import type { NextConfig } from "next";

// Fully static: every module page is pre-rendered from /content/modules at build time.
const config: NextConfig = {
  output: "export",
  trailingSlash: true,
  reactStrictMode: true,
};

export default config;
