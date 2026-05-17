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
      { id: "ocean_waves",  name: "Ocean Waves",   file: "sounds/ocean_waves.mp3",  icon: "Waves" },
      { id: "ocean_surf",   name: "Surf & Shore",  file: "sounds/ocean_surf.mp3",   icon: "Waves" },
    ],
  },
  {
    id: "marine",
    name: "Marine",
    thumbnail: "sounds/TR_tn_marine.png",
    tracks: [
      { id: "marine_tide",   name: "Tidal Pool",    file: "sounds/marine_tide.mp3",   icon: "Droplets" },
      { id: "marine_harbor", name: "Harbor",         file: "sounds/marine_harbor.mp3", icon: "Anchor" },
    ],
  },
  {
    id: "streams",
    name: "Streams",
    thumbnail: "sounds/TR_tn_streams.png",
    tracks: [
      { id: "stream_gentle", name: "Gentle Stream",  file: "sounds/stream_gentle.mp3", icon: "Droplets" },
      { id: "stream_rapids", name: "Rapids",          file: "sounds/stream_rapids.mp3", icon: "Droplets" },
    ],
  },
  {
    id: "forests",
    name: "Forests",
    thumbnail: "sounds/TR_tn_forests.png",
    tracks: [
      { id: "forest_birds",  name: "Forest Birds",   file: "sounds/forest_birds.mp3",  icon: "Bird" },
      { id: "forest_wind",   name: "Forest Wind",    file: "sounds/forest_wind.mp3",   icon: "TreePine" },
    ],
  },
  {
    id: "gardens",
    name: "Gardens",
    thumbnail: "sounds/TR_tn_gardens.png",
    tracks: [
      { id: "garden_birds",  name: "Garden Birds",   file: "sounds/garden_birds.mp3",  icon: "Bird" },
      { id: "garden_breeze", name: "Garden Breeze",  file: "sounds/garden_breeze.mp3", icon: "Leaf" },
    ],
  },
  {
    id: "fields",
    name: "Fields",
    thumbnail: "sounds/TR_tn_fields.png",
    tracks: [
      { id: "field_crickets", name: "Night Crickets", file: "sounds/field_crickets.mp3", icon: "Bug" },
      { id: "field_breeze",   name: "Field Breeze",   file: "sounds/field_breeze.mp3",   icon: "Leaf" },
    ],
  },
  {
    id: "rains",
    name: "Rains",
    thumbnail: "sounds/TR_tn_rains.png",
    tracks: [
      { id: "rain_light",  name: "Light Rain",   file: "sounds/rain_light.mp3",  icon: "CloudRain" },
      { id: "rain_heavy",  name: "Heavy Rain",   file: "sounds/rain_heavy.mp3",  icon: "CloudRain" },
    ],
  },
  {
    id: "storms",
    name: "Storms",
    thumbnail: "sounds/TR_tn_storms.png",
    tracks: [
      { id: "storm_thunder",  name: "Thunder",         file: "sounds/storm_thunder.mp3",  icon: "CloudLightning" },
      { id: "storm_rain",     name: "Storm Rain",      file: "sounds/storm_rain.mp3",     icon: "CloudRain" },
    ],
  },
  {
    id: "winds",
    name: "Winds",
    thumbnail: "sounds/TR_tn_winds.png",
    tracks: [
      { id: "wind_open",    name: "Open Wind",    file: "sounds/wind_open.mp3",    icon: "Wind" },
      { id: "wind_through", name: "Wind Through Trees", file: "sounds/wind_through.mp3", icon: "TreePine" },
    ],
  },
  {
    id: "fire",
    name: "Fire",
    thumbnail: "sounds/TR_tn_fire.png",
    tracks: [
      { id: "fire_campfire",  name: "Campfire",    file: "sounds/fire_campfire.mp3",  icon: "Flame" },
      { id: "fire_fireplace", name: "Fireplace",   file: "sounds/fire_fireplace.mp3", icon: "Flame" },
    ],
  },
  {
    id: "noise",
    name: "Noise",
    thumbnail: "sounds/TR_tn_noise.png",
    tracks: [
      { id: "noise_white", name: "White Noise",  file: "sounds/noise_white.mp3", icon: "Radio" },
      { id: "noise_pink",  name: "Pink Noise",   file: "sounds/noise_pink.mp3",  icon: "Radio" },
      { id: "noise_brown", name: "Brown Noise",  file: "sounds/noise_brown.mp3", icon: "Radio" },
    ],
  },
];

// Flat track list — consumed by the audio engine (do not remove)
export const TRACKS: SoundTrack[] = CATEGORIES.flatMap((c) => c.tracks);
