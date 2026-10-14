import { CATEGORIES } from "./sounds";

type RecommendationBand = {
  minHz: number;
  maxHz: number;
  trackIds: readonly string[];
};

// Selections transcribed from reference docs/epTR-DatabaseTags-v2.rtf.
// Approved inclusive Hz boundaries take precedence over the RTF's final 8999 endpoint.
export const FREQUENCY_RECOMMENDATIONS: readonly RecommendationBand[] = [
  // Upper-bass
  { minHz: 500, maxHz: 749, trackIds: [
    "ocean_high_tide_beach", "ocean_low_tide_bay", "ocean_waterlaps_cove_cine",
    "rain_quiet_storm", "rain_rolling_thunderstorm",
    "stream_cascading_river",
    "noise_pink_wave", "noise_pink_static", "noise_green_wave", "noise_green_static",
    "wind_light_breeze",
    "fire_campside_firepit", "fire_ceremonial_bonfire",
    "field_golden_pond",
    "garden_prayer_fountain",
  ] },
  // Lower-mid
  { minHz: 750, maxHz: 999, trackIds: [
    "ocean_high_tide_beach", "ocean_low_tide_bay",
    "rain_quiet_storm", "rain_rolling_thunderstorm",
    "stream_cascading_river",
    "fire_campside_firepit", "fire_ceremonial_bonfire",
    "wind_light_breeze", "wind_gusty_winds", "wind_whistling_chinook",
    "noise_white_wave", "noise_white_static", "noise_pink_wave", "noise_pink_static", "noise_green_wave", "noise_green_static",
  ] },
  // Midrange
  { minHz: 1000, maxHz: 1999, trackIds: [
    "ocean_high_tide_beach", "ocean_low_tide_beach", "ocean_low_tide_bay",
    "rain_lite_shower", "rain_downpour", "rain_quiet_storm", "rain_rolling_thunderstorm",
    "stream_fountain", "stream_mountain_spring", "stream_gentle_brook", "stream_cascading_river",
    "field_golden_pond", "field_midnight_bayou",
    "garden_tranquil_koi_pond", "garden_spa_moon_garden", "garden_prayer_fountain",
    "fire_chalet_stone_hearth",
    "wind_gusty_winds",
    "noise_white_wave", "noise_white_static", "noise_pink_wave", "noise_pink_static", "noise_green_wave", "noise_green_static",
  ] },
  // Upper-mid
  { minHz: 2000, maxHz: 2999, trackIds: [
    "ocean_high_tide_beach", "ocean_low_tide_beach", "ocean_low_tide_bay",
    "rain_lite_drizzle", "rain_lite_shower", "rain_downpour", "rain_quiet_storm", "rain_rolling_thunderstorm",
    "stream_fountain", "stream_mountain_spring", "stream_gentle_brook", "stream_cascading_river",
    "forest_night_chorus", "forest_amazon_jungle",
    "field_dusk_meadow", "field_midnight_bayou", "field_ozark_chorus",
    "garden_tranquil_koi_pond", "garden_spa_moon_garden", "garden_prayer_fountain",
    "fire_chalet_stone_hearth", "fire_campside_firepit", "fire_ceremonial_bonfire",
    "wind_gusty_winds", "wind_whistling_chinook",
    "noise_white_wave", "noise_white_static", "noise_pink_static", "noise_green_static",
  ] },
  // Bright-mid
  { minHz: 3000, maxHz: 3999, trackIds: [
    "ocean_high_tide_beach", "ocean_low_tide_beach", "ocean_low_tide_bay",
    "rain_lite_drizzle", "rain_lite_shower", "rain_downpour", "rain_quiet_storm", "rain_rolling_thunderstorm",
    "stream_fountain", "stream_mountain_spring", "stream_gentle_brook", "stream_cascading_river",
    "forest_night_chorus", "forest_amazon_jungle",
    "field_dusk_meadow", "field_midnight_bayou", "field_ozark_chorus",
    "garden_tranquil_koi_pond", "garden_spa_moon_garden", "garden_prayer_fountain",
    "fire_chalet_stone_hearth", "fire_campside_firepit", "fire_ceremonial_bonfire",
    "wind_gusty_winds", "wind_whistling_chinook",
    "noise_white_wave", "noise_white_static", "noise_pink_static", "noise_pink_wave",
  ] },
  // Lower-treble
  { minHz: 4000, maxHz: 4999, trackIds: [
    "ocean_high_tide_beach", "ocean_low_tide_beach", "ocean_low_tide_bay",
    "rain_lite_drizzle", "rain_lite_shower", "rain_downpour", "rain_quiet_storm", "rain_rolling_thunderstorm",
    "stream_fountain", "stream_mountain_spring", "stream_gentle_brook", "stream_cascading_river",
    "forest_night_chorus", "forest_amazon_jungle",
    "field_dusk_meadow", "field_midnight_bayou",
    "garden_tranquil_koi_pond", "garden_spa_moon_garden", "garden_prayer_fountain",
    "fire_chalet_stone_hearth", "fire_ceremonial_bonfire",
    "wind_gusty_winds", "wind_whistling_chinook",
    "noise_white_wave", "noise_white_static", "noise_pink_static", "noise_pink_wave",
  ] },
  // Mid-treble
  { minHz: 5000, maxHz: 5999, trackIds: [
    "ocean_high_tide_beach", "ocean_low_tide_beach", "ocean_low_tide_bay", "ocean_waterlaps_cove_cine",
    "rain_lite_drizzle", "rain_lite_shower", "rain_downpour", "rain_quiet_storm", "rain_rolling_thunderstorm",
    "stream_fountain", "stream_mountain_spring", "stream_gentle_brook", "stream_cascading_river",
    "forest_night_chorus", "forest_amazon_jungle",
    "field_dusk_meadow", "field_midnight_bayou",
    "garden_tranquil_koi_pond", "garden_spa_moon_garden", "garden_prayer_fountain",
    "fire_chalet_stone_hearth", "fire_campside_firepit", "fire_ceremonial_bonfire", "fire_firelight",
    "wind_light_breeze", "wind_gusty_winds", "wind_whistling_chinook",
    "noise_white_wave", "noise_white_static",
  ] },
  // Upper-treble
  { minHz: 6000, maxHz: 6999, trackIds: [
    "ocean_high_tide_beach", "ocean_low_tide_beach", "ocean_low_tide_bay", "ocean_waterlaps_cove_cine",
    "rain_lite_drizzle", "rain_lite_shower", "rain_downpour", "rain_quiet_storm", "rain_rolling_thunderstorm",
    "stream_fountain", "stream_mountain_spring", "stream_gentle_brook", "stream_cascading_river",
    "forest_night_chorus", "forest_amazon_jungle",
    "field_dusk_meadow", "field_midnight_bayou",
    "garden_tranquil_koi_pond", "garden_spa_moon_garden", "garden_prayer_fountain",
    "fire_chalet_stone_hearth", "fire_campside_firepit", "fire_ceremonial_bonfire", "fire_firelight",
    "wind_light_breeze", "wind_gusty_winds", "wind_whistling_chinook",
    "noise_white_wave", "noise_white_static",
  ] },
  // High-treble
  { minHz: 7000, maxHz: 7999, trackIds: [
    "ocean_high_tide_beach", "ocean_low_tide_beach", "ocean_low_tide_bay", "ocean_waterlaps_cove_cine",
    "rain_lite_drizzle", "rain_lite_shower", "rain_downpour", "rain_quiet_storm", "rain_rolling_thunderstorm",
    "stream_fountain", "stream_mountain_spring", "stream_gentle_brook", "stream_cascading_river",
    "forest_night_chorus", "forest_amazon_jungle",
    "field_dusk_meadow", "field_midnight_bayou",
    "garden_tranquil_koi_pond", "garden_spa_moon_garden", "garden_prayer_fountain",
    "fire_chalet_stone_hearth", "fire_campside_firepit", "fire_ceremonial_bonfire", "fire_firelight",
    "wind_light_breeze", "wind_gusty_winds", "wind_whistling_chinook",
    "noise_white_wave", "noise_white_static",
  ] },
  // Sizzle-treble
  { minHz: 8000, maxHz: 9000, trackIds: [
    "ocean_high_tide_beach", "ocean_low_tide_beach", "ocean_low_tide_bay", "ocean_waterlaps_cove_cine",
    "rain_lite_drizzle", "rain_lite_shower", "rain_downpour", "rain_quiet_storm", "rain_rolling_thunderstorm",
    "stream_fountain", "stream_mountain_spring", "stream_gentle_brook", "stream_cascading_river",
    "forest_night_chorus", "forest_amazon_jungle",
    "field_dusk_meadow", "field_midnight_bayou",
    "garden_tranquil_koi_pond", "garden_spa_moon_garden", "garden_prayer_fountain",
    "fire_chalet_stone_hearth", "fire_campside_firepit", "fire_ceremonial_bonfire", "fire_firelight",
    "wind_light_breeze", "wind_gusty_winds", "wind_whistling_chinook",
    "noise_white_wave", "noise_white_static",
  ] },
];

export function getRecommendedTrackIds(frequencyHz: number | null): string[] {
  if (frequencyHz === null) return [];
  return [...(FREQUENCY_RECOMMENDATIONS.find(band => frequencyHz >= band.minHz && frequencyHz <= band.maxHz)?.trackIds ?? [])];
}

export function getRecommendedCategoryNames(frequencyHz: number | null): string[] {
  const matches = new Set(getRecommendedTrackIds(frequencyHz));
  return CATEGORIES.filter(category => category.tracks.some(track => matches.has(track.id))).map(category => category.name.toLowerCase());
}