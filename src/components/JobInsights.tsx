import type { FieldRecord } from '../types'
import { jobSummary, recordIssues, recordMetrics } from '../lib/insights'
import { formatArea, formatDistance } from '../lib/geo'

export function JobInsights({ records, onReview }: { records: FieldRecord[]; onReview: () => void }) {
  const summary = jobSummary(records)
  return <section className="job-insights" aria-label="Job summary">
    <div><small>Recorded</small><strong>{summary.records}</strong><span>features · {summary.photos} photos</span></div>
    <div><small>Lines & routes</small><strong>{formatDistance(summary.lengthMetres)}</strong><span>approx. horizontal length</span></div>
    <div><small>Areas</small><strong>{formatArea(summary.areaSquareMetres)}</strong><span>sum · overlaps included</span></div>
    <button onClick={onReview} className={summary.review ? 'has-issues' : ''}><small>Before you leave</small><strong>{summary.review}</strong><span>{summary.review ? 'records to check →' : 'no checks flagged'}</span></button>
  </section>
}
export function RecordInsights({ record }: { record: FieldRecord }) {
  const metrics = recordMetrics(record)
  const issues = recordIssues(record)
  return <div className="record-insights">
    {metrics.perimeterMetres !== null && <p><strong>Perimeter</strong> {formatDistance(metrics.perimeterMetres)} · approximate</p>}
    {metrics.elapsedSeconds !== null && <p><strong>Recorded span</strong> {Math.round(metrics.elapsedSeconds / 60)} min · includes pauses</p>}
    {issues.length > 0 && <div className="quality-check"><strong>Field checks</strong><ul>{issues.map(issue => <li key={issue}>{issue}</li>)}</ul></div>}
  </div>
}
