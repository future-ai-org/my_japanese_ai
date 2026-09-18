import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

const repoRoot = "..";

function contentSecurityPolicy(options?: {
  allowInlineScripts?: boolean;
  port?: number;
}) {
  const scriptSrc = options?.allowInlineScripts
    ? "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'"
    : "script-src 'self' 'wasm-unsafe-eval'";
  const port = options?.port ?? 8048;
  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self' " +
      `ws://localhost:${port} ws://127.0.0.1:${port} ` +
      "https://huggingface.co https://*.huggingface.co https://*.hf.co https://raw.githubusercontent.com",
    "worker-src 'self' blob:",
    "child-src 'self' blob:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

const SECURITY_HEADERS = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy":
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repoRoot, "");
  const port = Number(env.PORT) > 0 ? Number(env.PORT) : 8048;
  const apiOrigin = env.BACKEND_DEV_ORIGIN || "http://127.0.0.1:8000";
  return {
    envDir: repoRoot,
    plugins: [react()],
    test: {
      environment: "jsdom",
      setupFiles: ["./tests/setup.ts"],
      coverage: {
        provider: "v8",
        reporter: ["text", "json-summary"],
        // Vitest `clean` removes this directory (and `.tmp`). Keep it off the
        // shared `.coverage/` root so parallel pytest can write there.
        reportsDirectory: "../.coverage/js",
        all: true,
        include: ["src/**/*.{ts,tsx}"],
        exclude: ["src/vite-env.d.ts"],
        thresholds: {
          lines:75,
        },
      },
    },
    server: {
      port,
      headers: {
        ...SECURITY_HEADERS,
        // Vite injects an inline React Refresh preamble; block it and the
        // app never mounts.
        "Content-Security-Policy": contentSecurityPolicy({
          allowInlineScripts: true,
          port,
        }),
      },
      fs: {
        allow: [repoRoot],
      },
      proxy: {
        "/api": {
          target: apiOrigin,
          changeOrigin: true,
        },
      },
    },
    preview: {
      headers: {
        ...SECURITY_HEADERS,
        "Content-Security-Policy": contentSecurityPolicy(),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes("@codemirror") || id.includes("@uiw")) {
              return "editor";
            }
            if (id.includes("node_modules")) {
              return "vendor";
            }
          }
        },
      },
    },
  };
});
