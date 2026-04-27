import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.monosaccharide180.microbegrowing",
  appName: "미생물 키우기",
  webDir: "dist",
  server: {
    androidScheme: "https",
  },
};

export default config;
