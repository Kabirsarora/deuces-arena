import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Deuces Arena",
    short_name: "Deuces",
    description:
      "Real-time multiplayer Deuces / Big Two with online rooms, bots, replays, and ML-ready move data.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#080a0d",
    theme_color: "#080a0d",
    orientation: "portrait",
    categories: ["games", "entertainment"],
    icons: [
      {
        src: "/icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any"
      },
      {
        src: "/icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable"
      }
    ]
  };
}
