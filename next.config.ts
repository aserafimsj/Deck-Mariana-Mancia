import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/** Origem do Supabase do projeto (API + tempo real), lida no build. */
function supabaseOrigins(): string {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    return `https://${url.host} wss://${url.host}`;
  } catch {
    return "";
  }
}

/**
 * Política de segurança de conteúdo (CSP), no modo "sem nonce" do guia do Next.js:
 * mantém as páginas estáticas (rápidas). 'unsafe-inline' em scripts é necessário nesse modo;
 * o risco é mitigado porque o React escapa todo texto exibido (nenhum HTML vindo de usuário é injetado).
 * Conexões só com o próprio site e o Supabase do projeto. Evolução: SRI (hoje experimental no Next).
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  `connect-src 'self' ${supabaseOrigins()}`.trim(),
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Service worker: nunca em cache (atualizações chegam na hora) e só scripts da própria origem.
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
