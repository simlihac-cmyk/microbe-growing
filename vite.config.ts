import { defineConfig, loadEnv, type HtmlTagDescriptor, type Plugin } from "vite";

const DEFAULT_ADSENSE_PUBLISHER_ID = "pub-1148471265184249";
const DEFAULT_GA_MEASUREMENT_ID = "G-WPQ9T86G1X";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const adsenseClientId = normalizeAdsenseClientId(
    env.VITE_ADSENSE_CLIENT_ID || env.VITE_ADSENSE_PUBLISHER_ID || DEFAULT_ADSENSE_PUBLISHER_ID,
  );
  const gaMeasurementId = normalizeGoogleAnalyticsMeasurementId(
    env.VITE_GA_MEASUREMENT_ID || DEFAULT_GA_MEASUREMENT_ID,
  );
  const isAndroidApp = env.VITE_ANDROID_APP === "true";

  return {
    plugins: [
      googleAnalyticsHeadPlugin(gaMeasurementId, isAndroidApp),
      adsenseHeadPlugin(adsenseClientId, isAndroidApp),
    ],
    server: {
      proxy: {
        "/api": {
          target: "http://127.0.0.1:4130",
          changeOrigin: true,
        },
      },
    },
  };
});

function googleAnalyticsHeadPlugin(measurementId: string, disabled: boolean): Plugin {
  return {
    name: "microbe-google-analytics-head",
    transformIndexHtml() {
      if (disabled || !measurementId) return [];

      return [
        {
          tag: "script",
          attrs: {
            async: true,
            src: `https://www.googletagmanager.com/gtag/js?id=${measurementId}`,
          },
          injectTo: "head",
        },
        {
          tag: "script",
          children: [
            "window.dataLayer = window.dataLayer || [];",
            "function gtag(){dataLayer.push(arguments);}",
            "gtag('js', new Date());",
            "",
            `gtag('config', '${measurementId}');`,
          ].join("\n"),
          injectTo: "head",
        },
      ] satisfies HtmlTagDescriptor[];
    },
  };
}

function adsenseHeadPlugin(clientId: string, disabled: boolean): Plugin {
  return {
    name: "microbe-adsense-head",
    transformIndexHtml() {
      if (disabled || !clientId) return [];

      return [
        {
          tag: "meta",
          attrs: {
            name: "google-adsense-account",
            content: clientId,
          },
          injectTo: "head",
        },
        {
          tag: "script",
          attrs: {
            async: true,
            src: `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${clientId}`,
            crossorigin: "anonymous",
          },
          injectTo: "head",
        },
      ] satisfies HtmlTagDescriptor[];
    },
  };
}

function normalizeAdsenseClientId(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("ca-pub-")) return trimmed;
  if (trimmed.startsWith("pub-")) return `ca-${trimmed}`;
  if (/^\d+$/.test(trimmed)) return `ca-pub-${trimmed}`;
  return "";
}

function normalizeGoogleAnalyticsMeasurementId(value: string): string {
  const trimmed = value.trim().toUpperCase();
  if (/^G-[A-Z0-9]+$/.test(trimmed)) return trimmed;
  return "";
}
