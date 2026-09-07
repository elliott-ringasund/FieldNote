import { Capacitor } from '@capacitor/core'
import { Geolocation, type Position } from '@capacitor/geolocation'
import { BackgroundGeolocation, type Location as BackgroundLocation } from '@capgo/background-geolocation'
import type { Coordinate } from '../types'
import { validPosition } from './insights'

const usableAccuracy = (value: number | null | undefined) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined

const options = { enableHighAccuracy: true, maximumAge: 4_000, timeout: 12_000, minimumUpdateInterval: 2_000 }

// Preserve provider estimates: Apple does not document a confidence percentage.
// Horizontal and vertical errors must not share a guessed conversion factor.
function coordinateFromPosition(position: Position | GeolocationPosition, native = false): Coordinate {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: usableAccuracy(position.coords.accuracy),
    accuracyReference: native ? (Capacitor.getPlatform() === 'android' ? 'android-68' : 'provider') : 'browser-95',
    altitude: position.coords.altitude,
    altitudeAccuracy: usableAccuracy(position.coords.altitudeAccuracy),
    heading: position.coords.heading,
    speed: position.coords.speed,
    source: 'device',
    timestamp: position.timestamp,
  }
}

function coordinateFromBackgroundLocation(location: BackgroundLocation): Coordinate {
  return {
    latitude: location.latitude,
    longitude: location.longitude,
    accuracy: usableAccuracy(location.accuracy),
    accuracyReference: Capacitor.getPlatform() === 'android' ? 'android-68' : 'provider',
    altitude: location.altitude,
    altitudeAccuracy: usableAccuracy(location.altitudeAccuracy),
    heading: location.bearing,
    speed: location.speed,
    source: 'device',
    timestamp: location.time ?? Date.now(),
  }
}

async function ensureNativePermission() {
  const current = await Geolocation.checkPermissions()
  if (current.location !== 'granted') {
    const requested = await Geolocation.requestPermissions({ permissions: ['location'] })
    if (requested.location !== 'granted') throw new Error('Location permission denied')
  }
}

export async function getDevicePosition() {
  if (Capacitor.isNativePlatform()) {
    await ensureNativePermission()
    return requireFreshPosition(coordinateFromPosition(await Geolocation.getCurrentPosition(options), true))
  }
  if (!navigator.geolocation) throw new Error('Location is unavailable on this device')
  return new Promise<Coordinate>((resolve, reject) => navigator.geolocation.getCurrentPosition((position) => { try { resolve(requireFreshPosition(coordinateFromPosition(position))) } catch (error) { reject(error) } }, reject, options))
}

export async function startDevicePositionWatch(onPosition: (coordinate: Coordinate) => void, onError: (error: unknown) => void): Promise<() => void> {
  if (Capacitor.isNativePlatform()) {
    await BackgroundGeolocation.start({
      backgroundTitle: 'FieldNote route recording',
      backgroundMessage: 'FieldNote is recording this job route. Open the app to pause or finish.',
      requestPermissions: true,
      stale: false,
      distanceFilter: 2,
      minIntervalMs: 2_000,
    }, (location, error) => {
      if (error) onError(error)
      else if (location) onPosition(coordinateFromBackgroundLocation(location))
    })
    return () => { void BackgroundGeolocation.stop() }
  }
  if (!navigator.geolocation) throw new Error('Location is unavailable on this device')
  const id = navigator.geolocation.watchPosition((position) => onPosition(coordinateFromPosition(position)), onError, options)
  return () => navigator.geolocation.clearWatch(id)
}

export function requireFreshPosition(coordinate: Coordinate): Coordinate {
  if (!validPosition(coordinate) || !Number.isFinite(coordinate.timestamp) || Date.now() - coordinate.timestamp > 30_000 || coordinate.timestamp > Date.now() + 5_000) throw new Error('Position is stale or invalid. Try again outdoors.')
  return coordinate
}
