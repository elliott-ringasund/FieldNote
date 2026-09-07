import type { Coordinate, WeatherSnapshot } from '../types'

type OpenMeteoResponse = {
  current?: {
    time: string
    temperature_2m: number
    apparent_temperature: number
    relative_humidity_2m: number
    precipitation: number
    cloud_cover: number
    weather_code: number
    wind_speed_10m: number
    wind_direction_10m: number
    wind_gusts_10m: number
  }
}

export async function getLiveWeather(position: Coordinate, signal?: AbortSignal): Promise<WeatherSnapshot> {
  const parameters = new URLSearchParams({
    latitude: String(position.latitude),
    longitude: String(position.longitude),
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,cloud_cover,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m',
    wind_speed_unit: 'kmh',
    timezone: 'auto',
  })
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${parameters}`, { signal })
  if (!response.ok) throw new Error(`Weather service returned ${response.status}.`)
  const payload = await response.json() as OpenMeteoResponse
  if (!payload.current) throw new Error('Current weather was not available for this location.')
  return {
    capturedAt: payload.current.time,
    latitude: position.latitude,
    longitude: position.longitude,
    temperature: payload.current.temperature_2m,
    apparentTemperature: payload.current.apparent_temperature,
    relativeHumidity: payload.current.relative_humidity_2m,
    precipitation: payload.current.precipitation,
    cloudCover: payload.current.cloud_cover,
    weatherCode: payload.current.weather_code,
    windSpeed: payload.current.wind_speed_10m,
    windDirection: payload.current.wind_direction_10m,
    windGusts: payload.current.wind_gusts_10m,
    provider: 'Open-Meteo',
  }
}

export function weatherLabel(code: number) {
  if (code === 0) return 'Clear'
  if (code <= 3) return 'Partly cloudy'
  if ([45, 48].includes(code)) return 'Fog'
  if (code <= 57) return 'Drizzle'
  if (code <= 67) return 'Rain'
  if (code <= 77) return 'Snow'
  if (code <= 82) return 'Rain showers'
  if (code <= 86) return 'Snow showers'
  return 'Thunderstorm'
}
