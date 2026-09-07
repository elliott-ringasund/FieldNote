import { useEffect, useState } from 'react'
import { ArrowLeftRight, LocateFixed, X } from 'lucide-react'
import type { Coordinate, FieldRecord } from '../types'
import { bearingDegrees, validPosition } from '../lib/insights'
import { distanceMetres, formatDistance } from '../lib/geo'
import { formatAccuracy } from '../lib/accuracy'

export function SurveyTools({ records, position, onLocate, onClose }: { records: FieldRecord[]; position: Coordinate | null; onLocate: () => void; onClose: () => void }) {
  const points = records.filter(record => record.mode === 'point' && record.coordinates.length === 1 && validPosition(record.coordinates[0]))
  const [from, setFrom] = useState('device')
  const [to, setTo] = useState(points[0]?.id ?? '')
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 5000); return () => window.clearInterval(timer) }, [])
  const a = from === 'device' ? position : points.find(record => record.id === from)?.coordinates[0]
  const b = points.find(record => record.id === to)?.coordinates[0]
  const stale = from === 'device' && (!position || now - position.timestamp > 30_000)
  const bearing = a && b ? bearingDegrees(a, b) : null
  return <div className="sheet-backdrop solid"><section className="bottom-sheet survey-tools" role="dialog" aria-modal="true" aria-labelledby="survey-tools-title">
    <div className="sheet-heading"><div><p className="eyebrow">Field calculations</p><h2 id="survey-tools-title">Distance & bearing</h2></div><button className="icon-button" onClick={onClose} aria-label="Close field calculations"><X/></button></div>
    <p className="sheet-intro">Find a recorded point or compare two points. Bearings run clockwise from true north.</p>
    <label className="field-label"><span>From</span><select value={from} onChange={event => { setFrom(event.target.value); setNow(Date.now()) }}><option value="device">My last phone position</option>{points.map(record => <option key={record.id} value={record.id}>{record.label}</option>)}</select></label>
    <label className="field-label"><span>To</span><select value={to} onChange={event => { setTo(event.target.value); setNow(Date.now()) }}><option value="">Choose a recorded point</option>{points.map(record => <option key={record.id} value={record.id}>{record.label}</option>)}</select></label>
    {from === 'device' ? <button className="secondary-button" onClick={() => { setNow(Date.now()); onLocate() }}><LocateFixed size={18}/> Refresh phone position</button> : <button className="secondary-button" disabled={!to} onClick={() => { setFrom(to); setTo(from) }}><ArrowLeftRight size={18}/> Swap points</button>}
    {a && b && <div className="survey-results"><div><small>Horizontal distance · approx.</small><strong>{formatDistance(distanceMetres(a, b))}</strong></div><div><small>Initial bearing · true north</small><strong>{bearing === null ? 'Same position' : `${bearing.toFixed(1)}°`}</strong></div></div>}
    <p className="field-help">{stale ? 'Phone position is missing or older than 30 seconds. Refresh before using these results. ' : ''}{a ? `From: ${formatAccuracy(a.accuracy)}. ` : ''}{b ? `To: ${formatAccuracy(b.accuracy)}. ` : ''}This is an approximate direction, not a live compass or precision stakeout. Refresh as you move.</p>
    {!points.length && <p className="import-alert warning">Collect or import a point to use this tool.</p>}
  </section></div>
}
