import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Viva",
    short_name: "Viva",
    description: "A voice-first study companion. Add notes, get quizzed out loud.",
    start_url: "/",
    display: "standalone",
    background_color: "#2338D9",
    theme_color: "#2338D9",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
