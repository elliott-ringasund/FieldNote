import { Check, Keyboard, X } from 'lucide-react'
import { useState } from 'react'
import { transformToWgs84 } from '../lib/crs'
import type { Coordinate, Project } from '../types'

type Props = { project: Project; onClose: () => void; onCoordinate: (coordinate: Coordinate) => void }

export function KeyInPointSheet({ onClose, onCoordinate }: Props) {
  const [x, setX] = useState('')
  const [y, setY] = useState('')
  const [error, setError] = useState('')
  const submit = () => {
    try {
      const parsedX = Number(x); const parsedY = Number(y)
      if (!Number.isFinite(parsedX) || !Number.isFinite(parsedY)) throw new Error('Enter valid numeric X and Y coordinates.')
      const [longitude, latitude] = transformToWgs84(parsedX, parsedY, 'EPSG:4326')
      onCoordinate({ longitude, latitude, source: 'manual', timestamp: Date.now() })
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The coordinate could not be converted.') }
  }
  return <div className="sheet-backdrop solid"><section className="bottom-sheet compact-sheet" role="dialog" aria-modal="true"><div className="sheet-handle"/><div className="sheet-heading"><div><p className="eyebrow">Manual coordinate</p><h2>Key in a point</h2></div><button type="button" className="icon-button" onClick={onClose}><X/></button></div><div className="form-scroll"><label className="field-label disabled-setting"><span>Coordinate system · coming later</span><select value="EPSG:4326" disabled><option>WGS 84 longitude / latitude</option></select></label><div className="two-fields"><label className="field-label"><span>Longitude (X)</span><input inputMode="decimal" value={x} onChange={(event) => setX(event.target.value)} placeholder="151.209300"/></label><label className="field-label"><span>Latitude (Y)</span><input inputMode="decimal" value={y} onChange={(event) => setY(event.target.value)} placeholder="-33.868800"/></label></div>{error && <div className="import-alert error"><span><strong>Invalid coordinate</strong><small>{error}</small></span></div>}</div><div className="sheet-actions"><button className="secondary-button" type="button" onClick={onClose}>Cancel</button><button className="primary-button" type="button" onClick={submit}><Keyboard size={18}/><Check size={18}/> Use point</button></div></section></div>
}
