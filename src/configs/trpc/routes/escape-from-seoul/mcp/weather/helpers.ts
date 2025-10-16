import type { WeatherUnitsSystem } from './fetch-open-meteo-weather';

export const formatSpeed = (
  value: number | null,
  unitsSystem: WeatherUnitsSystem,
) => {
  if (value === null || Number.isNaN(value)) return null;
  const unit = unitsSystem === 'IMPERIAL' ? 'mph' : 'km/h';

  return `${value.toFixed(1)} ${unit}`;
};

export const formatPrecipitation = (
  value: number | null,
  unitsSystem: WeatherUnitsSystem,
) => {
  if (value === null || Number.isNaN(value)) return null;
  const unit = unitsSystem === 'IMPERIAL' ? 'inch' : 'mm';

  return `${value.toFixed(unitsSystem === 'IMPERIAL' ? 2 : 1)} ${unit}`;
};
