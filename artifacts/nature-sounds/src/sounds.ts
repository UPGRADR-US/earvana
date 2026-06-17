export type SoundTrack = {
  id: string;
  name: string;       // format: "prefix: track name" — split on ": " for styled rendering
  file: string;       // path relative to public/, e.g. "sounds/ocean-HighTideBeach.mp3"
  icon: string;       // lucide-react icon name

  // Optional per-track loop settings
  crossfadeDuration?: number; // seconds
  loopStart?: number;         // seconds
  loopEnd?: number;           // seconds

  // Default gain (0–1 linear) applied on first load.
  // Derived from the neutral 0.5 baseline:
  //   +2 dB → 0.5 × 10^( 2/20) ≈ 0.561
  //   −2 dB → 0.5 × 10^(-2/20) ≈ 0.446
  defaultVolume?: number;
};

export type SoundCategory = {
  id: string;
  name: string;
  thumbnail: string;
  tracks: SoundTrack[];
};

export const CATEGORIES: SoundCategory[] = [
  {
    id: "oceans",
    name: "Oceans",
    thumbnail: "sounds/TR_tn_oceans.png",
    tracks: [
      { id: "ocean_high_tide_beach",  name: "ocean: high-tide beach",  file: "sounds/ocean-HighTideBeach.mp3",  icon: "Waves", defaultVolume: 0.561 },
      { id: "ocean_low_tide_beach",   name: "ocean: low-tide beach",   file: "sounds/ocean-LowTideBeach.mp3",   icon: "Waves", defaultVolume: 0.561 },
      { id: "ocean_low_tide_bay",     name: "ocean: low-tide bay",     file: "sounds/ocean-LowTideBay.mp3",     icon: "Waves", defaultVolume: 0.561 },
      { id: "ocean_waterlaps_cove",   name: "ocean: waterlaps cove",   file: "sounds/ocean-WaterlapsCove.mp3",  icon: "Waves", defaultVolume: 0.561 },
    ],
  },
  {
    id: "rains",
    name: "Rains",
    thumbnail: "sounds/TR_tn_rains.png",
    tracks: [
      { id: "rain_lite_drizzle",          name: "rain: lite drizzle",          file: "sounds/rain-LiteDrizzle.mp3",          icon: "CloudRain" },
      { id: "rain_lite_shower",           name: "rain: lite shower",           file: "sounds/rain-LiteShower.mp3",           icon: "CloudRain" },
      { id: "rain_downpour",              name: "rain: downpour",              file: "sounds/rain-Downpour.mp3",             icon: "CloudRain" },
      { id: "rain_quiet_storm",           name: "rain: quiet storm",           file: "sounds/rain-QuietStorm.mp3",           icon: "CloudLightning" },
      { id: "rain_rolling_thunderstorm",  name: "rain: rolling thunderstorm",  file: "sounds/rain-RollingThunderstorm.mp3",  icon: "CloudLightning" },
    ],
  },
  {
    id: "streams",
    name: "Streams",
    thumbnail: "sounds/TR_tn_streams.png",
    tracks: [
      { id: "stream_fountain",        name: "stream: fountain",        file: "sounds/stream-Fountain.mp3",        icon: "Droplets", defaultVolume: 0.397 },
      { id: "stream_mountain_spring", name: "stream: mountain spring", file: "sounds/stream-MountainSpring.mp3",  icon: "Droplets", defaultVolume: 0.397 },
      { id: "stream_gentle_brook",    name: "stream: gentle brook",    file: "sounds/stream-GentleBrook.mp3",     icon: "Droplets", defaultVolume: 0.397 },
      { id: "stream_cascading_river", name: "stream: cascading river", file: "sounds/stream-CascadingRiver.mp3",  icon: "Droplets", defaultVolume: 0.397 },
    ],
  },
  {
    id: "forests",
    name: "Forests",
    thumbnail: "sounds/TR_tn_forests.png",
    tracks: [
      { id: "forest_dusk_calm",     name: "forest: dusk calm",     file: "sounds/forest-DuskCalm.mp3",     icon: "TreePine" },
      { id: "forest_night_chorus",  name: "forest: night chorus",  file: "sounds/forest-NightChorus.mp3",  icon: "TreePine" },
      { id: "forest_amazon_jungle", name: "forest: amazon jungle", file: "sounds/forest-AmazonJungle.mp3", icon: "TreePine" },
    ],
  },
  {
    id: "fields",
    name: "Fields",
    thumbnail: "sounds/TR_tn_fields.png",
    tracks: [
      { id: "field_dusk_meadow",       name: "field: dusk meadow",       file: "sounds/field-DuskMeadow.mp3",       icon: "Leaf" },
      { id: "field_midnight_wetlands", name: "field: midnight wetlands", file: "sounds/field-MidnightWetlands.mp3", icon: "Leaf" },
    ],
  },
  {
    id: "gardens",
    name: "Gardens",
    thumbnail: "sounds/TR_tn_gardens.png",
    tracks: [
      { id: "garden_tranquil_koi_pond", name: "garden: tranquil koi pond", file: "sounds/garden-TranquilKoiPond.mp3", icon: "Leaf" },
      { id: "garden_spa_moon_garden",   name: "garden: spa moon garden",   file: "sounds/garden-SpaMoonGarden.mp3",   icon: "Leaf" },
    ],
  },
  {
    id: "fire",
    name: "Fire",
    thumbnail: "sounds/TR_tn_fire.png",
    tracks: [
      { id: "fire_chalet_stone_hearth", name: "fire: chalet stone hearth", file: "sounds/fire-ChaletStoneHearth.mp3", icon: "Flame" },
      { id: "fire_campside_firepit",    name: "fire: campside firepit",    file: "sounds/fire-CampsideFirepit.mp3",    icon: "Flame" },
      { id: "fire_ceremonial_bonfire",  name: "fire: ceremonial bonfire",  file: "sounds/fire-CeremonialBonfire.mp3",  icon: "Flame" },
    ],
  },
  {
    id: "winds",
    name: "Winds",
    thumbnail: "sounds/TR_tn_winds.png",
    tracks: [
      { id: "wind_light_breeze",     name: "wind: light breeze",     file: "sounds/wind-LightBreeze.mp3",     icon: "Wind" },
      { id: "wind_gusty_winds",      name: "wind: gusty winds",      file: "sounds/wind-GustyWinds.mp3",      icon: "Wind" },
      { id: "wind_whistling_chinook",name: "wind: whistling chinook", file: "sounds/wind-WhistlingChinook.mp3", icon: "Wind" },
    ],
  },
  {
    id: "noise",
    name: "Noise",
    thumbnail: "sounds/TR_tn_noise.png",
    tracks: [
      { id: "noise_white_wave",   name: "noise: white wave",        file: "sounds/noise-WhiteWave.mp3",   icon: "Radio" },
      { id: "noise_pink_wave",    name: "noise: pink wave",         file: "sounds/noise-PinkWave.mp3",    icon: "Radio" },
      { id: "noise_white_static", name: "noise: white noise-static",file: "sounds/noise-WhiteStatic.mp3", icon: "Radio", crossfadeDuration: 2 },
      { id: "noise_pink_static",  name: "noise: pink noise-static", file: "sounds/noise-PinkStatic.mp3",  icon: "Radio", crossfadeDuration: 2 },
    ],
  },
];

// Flat track list — consumed by the audio engine (do not remove)
export const TRACKS: SoundTrack[] = CATEGORIES.flatMap((c) => c.tracks);
