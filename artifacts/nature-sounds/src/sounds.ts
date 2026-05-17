export type SoundTrack = {
  id: string;
  name: string;
  file: string; // path relative to public/, e.g. "sounds/rain.mp3"
  icon: string; // lucide-react icon name as a string
};

export const TRACKS: SoundTrack[] = [
  { id: "rain", name: "Rain", file: "sounds/rain.mp3", icon: "CloudRain" },
  { id: "forest", name: "Forest", file: "sounds/forest.mp3", icon: "Trees" },
  { id: "ocean", name: "Ocean Waves", file: "sounds/ocean.mp3", icon: "Waves" },
  { id: "fire", name: "Campfire", file: "sounds/fire.mp3", icon: "Flame" },
  { id: "wind", name: "Wind", file: "sounds/wind.mp3", icon: "Wind" },
  { id: "thunder", name: "Thunder", file: "sounds/thunder.mp3", icon: "CloudLightning" },
  { id: "stream", name: "Stream", file: "sounds/stream.mp3", icon: "Droplets" },
  { id: "night", name: "Night Crickets", file: "sounds/night.mp3", icon: "Moon" },
];