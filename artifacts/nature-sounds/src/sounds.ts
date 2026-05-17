export type SoundTrack = {
  id: string;
  name: string;
  file: string;       // path relative to public/, e.g. "sounds/rain.mp3"
  icon: string;       // lucide-react icon name as a string

  // Optional per-track loop settings — engine falls back to global defaults if omitted
  crossfadeDuration?: number; // seconds — how long the crossfade overlap lasts
  loopStart?: number;         // seconds into the file where the loop region begins
  loopEnd?: number;           // seconds into the file where the loop region ends
};

export type SoundCategory = {
  id: string;
  name: string;
  thumbnail: string;   // filename in public/, e.g. "tn_oceans.png"
  tracks: SoundTrack[];
};

export const CATEGORIES: SoundCategory[] = [
  {
    id: "oceans",
    name: "Oceans",
    thumbnail: "tn_oceans.png",
    tracks: [
      { id: "ocean", name: "Ocean Waves", file: "sounds/ocean.mp3", icon: "Waves" },
    ],
  },
  {
    id: "streams",
    name: "Streams",
    thumbnail: "tn_streams.png",
    tracks: [
      { id: "stream", name: "Stream", file: "sounds/stream.mp3", icon: "Droplets" },
    ],
  },
  {
    id: "forests",
    name: "Forests",
    thumbnail: "tn_forests.png",
    tracks: [
      { id: "forest", name: "Forest", file: "sounds/forest.mp3", icon: "Trees" },
    ],
  },
  {
    id: "rains",
    name: "Rains",
    thumbnail: "tn_rains.png",
    tracks: [
      { id: "rain", name: "Rain", file: "sounds/rain.mp3", icon: "CloudRain" },
    ],
  },
  {
    id: "storms",
    name: "Storms",
    thumbnail: "tn_storms.png",
    tracks: [
      { id: "thunder", name: "Thunder", file: "sounds/thunder.mp3", icon: "CloudLightning" },
      { id: "wind",    name: "Wind",    file: "sounds/wind.mp3",    icon: "Wind" },
    ],
  },
];

// Flat track list — consumed by the audio engine (do not remove)
export const TRACKS: SoundTrack[] = CATEGORIES.flatMap((c) => c.tracks);
