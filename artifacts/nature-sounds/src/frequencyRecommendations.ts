import { CATEGORIES } from "./sounds";

type RecommendationBand = {
  minHz: number;
  maxHz: number;
  trackIds: readonly string[];
};

const oceanCore = ["ocean_high_tide_beach", "ocean_low_tide_bay"] as const;
const oceanMid = [...oceanCore, "ocean_low_tide_beach"] as const;
const oceanHigh = [...oceanMid, "ocean_waterlaps_cove", "ocean_waterlaps_cove_cine"] as const;
const rainCore = ["rain_quiet_storm", "rain_rolling_thunderstorm"] as const;
const rainMid = ["rain_lite_shower", "rain_downpour", ...rainCore] as const;
const rainHigh = ["rain_lite_drizzle", ...rainMid] as const;
const streamCore = ["stream_cascading_river"] as const;
const streamAll = ["stream_fountain", "stream_mountain_spring", "stream_gentle_brook", "stream_cascading_river"] as const;
const fieldAll = ["field_dusk_meadow", "field_midnight_wetlands"] as const;
const gardenCore = ["garden_tranquil_koi_pond", "garden_spa_moon_garden"] as const;
const fireAll = ["fire_chalet_stone_hearth", "fire_campside_firepit", "fire_ceremonial_bonfire"] as const;
const windAll = ["wind_light_breeze", "wind_gusty_winds", "wind_whistling_chinook"] as const;
const forestTreble = ["forest_night_chorus", "forest_amazon_jungle"] as const;
const noiseLower = ["noise_white_wave", "noise_white_static", "noise_pink_wave", "noise_pink_static", "noise_green_wave", "noise_green_static"] as const;
const whiteNoise = ["noise_white_wave", "noise_white_static"] as const;

export const FREQUENCY_RECOMMENDATIONS: readonly RecommendationBand[] = [
  { minHz: 500, maxHz: 749, trackIds: [...oceanCore, ...rainCore, ...streamCore, "noise_pink_wave", "noise_pink_static", "noise_green_wave", "noise_green_static", "wind_light_breeze", "fire_campside_firepit", "fire_ceremonial_bonfire"] },
  { minHz: 750, maxHz: 999, trackIds: [...oceanCore, ...rainCore, ...streamCore, "fire_campside_firepit", "fire_ceremonial_bonfire", ...windAll, ...noiseLower] },
  { minHz: 1000, maxHz: 1999, trackIds: [...oceanMid, ...rainMid, ...streamAll, ...gardenCore, "fire_chalet_stone_hearth", "wind_gusty_winds", ...noiseLower] },
  { minHz: 2000, maxHz: 2999, trackIds: [...oceanMid, ...rainHigh, ...streamAll, ...forestTreble, ...fieldAll, ...gardenCore, ...fireAll, "wind_gusty_winds", "wind_whistling_chinook", "noise_white_wave", "noise_white_static", "noise_pink_static", "noise_green_static"] },
  { minHz: 3000, maxHz: 3999, trackIds: [...oceanMid, ...rainHigh, ...streamAll, ...forestTreble, ...fieldAll, ...gardenCore, ...fireAll, "wind_gusty_winds", "wind_whistling_chinook", "noise_white_wave", "noise_white_static", "noise_pink_static", "noise_pink_wave"] },
  { minHz: 4000, maxHz: 4999, trackIds: [...oceanMid, ...rainHigh, ...streamAll, ...forestTreble, ...fieldAll, ...gardenCore, "fire_chalet_stone_hearth", "fire_ceremonial_bonfire", "wind_gusty_winds", "wind_whistling_chinook", "noise_white_wave", "noise_white_static", "noise_pink_static", "noise_pink_wave"] },
  { minHz: 5000, maxHz: 5999, trackIds: [...oceanHigh, ...rainHigh, ...streamAll, ...forestTreble, ...fieldAll, ...gardenCore, ...fireAll, ...windAll, ...whiteNoise] },
  { minHz: 6000, maxHz: 6999, trackIds: [...oceanHigh, ...rainHigh, ...streamAll, ...forestTreble, ...fieldAll, ...gardenCore, ...fireAll, ...windAll, ...whiteNoise] },
  { minHz: 7000, maxHz: 7999, trackIds: [...oceanHigh, ...rainHigh, ...streamAll, ...forestTreble, ...fieldAll, ...gardenCore, ...fireAll, ...windAll, ...whiteNoise] },
  { minHz: 8000, maxHz: 8999, trackIds: [...oceanHigh, ...rainHigh, ...streamAll, ...forestTreble, ...fieldAll, ...gardenCore, ...fireAll, ...windAll, ...whiteNoise] },
];

export function getRecommendedTrackIds(frequencyHz: number | null): string[] {
  if (frequencyHz === null) return [];
  return [...(FREQUENCY_RECOMMENDATIONS.find(band => frequencyHz >= band.minHz && frequencyHz <= band.maxHz)?.trackIds ?? [])];
}

export function getRecommendedCategoryNames(frequencyHz: number | null): string[] {
  const matches = new Set(getRecommendedTrackIds(frequencyHz));
  return CATEGORIES.filter(category => category.tracks.some(track => matches.has(track.id))).map(category => category.name.toLowerCase());
}