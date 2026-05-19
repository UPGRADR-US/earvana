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
  thumbnail: string;   // filename in public/sounds/, e.g. "TR_tn_oceans.png"
  tracks: SoundTrack[];
};

export const CATEGORIES: SoundCategory[] = [
  {
    id: "oceans",
    name: "Oceans",
    thumbnail: "sounds/TR_tn_oceans.png",
    tracks: [
      { id: "ocean_night_calm",   name: "Night-Calm",   file: "sounds/ocean_night_calm.mp3",   icon: "Waves" },
      { id: "ocean_night_active", name: "Night-Active", file: "sounds/ocean_night_active.mp3", icon: "Waves" },
      { id: "ocean_day_calm",     name: "Day-Calm",     file: "sounds/ocean_day_calm.mp3",     icon: "Waves" },
      { id: "ocean_day_active",   name: "Day-Active",   file: "sounds/ocean_day_active.mp3",   icon: "Waves" },
    ],
  },
  {
    id: "marine",
    name: "Marine",
    thumbnail: "sounds/TR_tn_marine.png",
    tracks: [
      { id: "marine_under_waves",  name: "Under-Waves",  file: "sounds/marine_under_waves.mp3",  icon: "Droplets" },
      { id: "marine_quiet_seabed", name: "Quiet-Seabed", file: "sounds/marine_quiet_seabed.mp3", icon: "Droplets" },
      { id: "marine_whale_song",   name: "Whale-Song",   file: "sounds/marine_whale_song.mp3",   icon: "Waves" },
    ],
  },
  {
    id: "streams",
    name: "Streams",
    thumbnail: "sounds/TR_tn_streams.png",
    tracks: [
      { id: "stream_fountain",    name: "Fountain",    file: "sounds/stream_fountain.mp3",    icon: "Droplets" },
      { id: "stream_brook",       name: "Brook",       file: "sounds/stream_brook.mp3",       icon: "Droplets" },
      { id: "stream_small_river", name: "Small-River", file: "sounds/stream_small_river.mp3", icon: "Droplets" },
      { id: "stream_big_river",   name: "Big-River",   file: "sounds/stream_big_river.mp3",   icon: "Droplets" },
    ],
  },
  {
    id: "forests",
    name: "Forests",
    thumbnail: "sounds/TR_tn_forests.png",
    tracks: [
      { id: "forest_calm",   name: "Calm",   file: "sounds/Forest(calm).mp3",   icon: "TreePine" },
      { id: "forest_active", name: "Active", file: "sounds/Forest(active).mp3", icon: "TreePine" },
      { id: "forest_amazon", name: "Amazon", file: "sounds/Forest(amzn).mp3",   icon: "TreePine" },
    ],
  },
  {
    id: "gardens",
    name: "Gardens",
    thumbnail: "sounds/TR_tn_gardens.png",
    tracks: [
      { id: "garden_calm",   name: "Calm",   file: "sounds/garden_calm.mp3",   icon: "Leaf" },
      { id: "garden_active", name: "Active", file: "sounds/garden_active.mp3", icon: "Leaf" },
    ],
  },
  {
    id: "fields",
    name: "Fields",
    thumbnail: "sounds/TR_tn_fields.png",
    tracks: [
      { id: "field_calm",   name: "Calm",   file: "sounds/Field(calm).mp3",   icon: "Leaf" },
      { id: "field_active", name: "Active", file: "sounds/Field(actv).mp3",   icon: "Leaf" },
    ],
  },
  {
    id: "rains",
    name: "Rains",
    thumbnail: "sounds/TR_tn_rains.png",
    tracks: [
      { id: "rain_drizzle",  name: "Drizzle",  file: "sounds/rain_drizzle.mp3",  icon: "CloudRain" },
      { id: "rain_moderate", name: "Moderate", file: "sounds/rain_moderate.mp3", icon: "CloudRain" },
      { id: "rain_downpour", name: "Downpour", file: "sounds/rain_downpour.mp3", icon: "CloudRain" },
    ],
  },
  {
    id: "storms",
    name: "Storms",
    thumbnail: "sounds/TR_tn_storms.png",
    tracks: [
      { id: "storm_calm",   name: "Calm",   file: "sounds/Storm(calm).mp3",   icon: "CloudLightning" },
      { id: "storm_active", name: "Active", file: "sounds/Storm(active).mp3", icon: "CloudLightning" },
    ],
  },
  {
    id: "winds",
    name: "Winds",
    thumbnail: "sounds/TR_tn_winds.png",
    tracks: [
      { id: "wind_gusty",     name: "Gusty",     file: "sounds/(t)Wind(gusty).mp3",     icon: "Wind" },
      { id: "wind_whistling", name: "Whistling", file: "sounds/(t)Wind(whistling).mp3", icon: "Wind" },
    ],
  },
  {
    id: "fire",
    name: "Fire",
    thumbnail: "sounds/TR_tn_fire.png",
    tracks: [
      { id: "fire_crackle", name: "Crackle", file: "sounds/fire_crackle.mp3", icon: "Flame" },
      { id: "fire_bonfire", name: "Bonfire", file: "sounds/fire_bonfire.mp3", icon: "Flame" },
    ],
  },
  {
    id: "noise",
    name: "Noise",
    thumbnail: "sounds/TR_tn_noise.png",
    tracks: [
      { id: "noise_white_static",  name: "White-Static",  file: "sounds/noise_white_static.mp3",  icon: "Radio" },
      { id: "noise_pink_static",   name: "Pink-Static",   file: "sounds/noise_pink_static.mp3",   icon: "Radio" },
      { id: "noise_green_static",  name: "Green-Static",  file: "sounds/noise_green_static.mp3",  icon: "Radio" },
      { id: "noise_brown_static",  name: "Brown-Static",  file: "sounds/noise_brown_static.mp3",  icon: "Radio" },
      { id: "noise_white_rolling", name: "White-Rolling", file: "sounds/(t)Noise-Rolling(WHT).mp3", icon: "Radio" },
      { id: "noise_pink_rolling",  name: "Pink-Rolling",  file: "sounds/(t)Noise-Rolling(PNK).mp3",  icon: "Radio" },
      { id: "noise_green_rolling", name: "Green-Rolling", file: "sounds/noise_green_rolling.mp3", icon: "Radio" },
      { id: "noise_brown_rolling", name: "Brown-Rolling", file: "sounds/noise_brown_rolling.mp3", icon: "Radio" },
    ],
  },
];

// Flat track list — consumed by the audio engine (do not remove)
export const TRACKS: SoundTrack[] = CATEGORIES.flatMap((c) => c.tracks);
