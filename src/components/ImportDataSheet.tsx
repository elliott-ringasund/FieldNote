import { AlertTriangle, CheckCircle2, ChevronDown, FileArchive, FileSpreadsheet, FileUp, MapPinned, X } from 'lucide-react'
import { useState, type ChangeEvent } from 'react'
import { CRS_OPTIONS } from '../lib/crs'
import { csvToRecords, geoJsonToRecords, parseCsv, parseKml, parseShapefile, projectDistanceWarning, type CsvPreview } from '../lib/import'
import type { FieldRecord } from '../types'

type ImportFormat = 'csv' | 'kml' | 'shapefile'
type Props = {
  projectId: string
  existingRecords: FieldRecord[]
  defaultCrs?: string
  onClose: () => void
  onImport: (records: FieldRecord[]) => void
}

const formatName: Record<ImportFormat, string> = { csv: 'CSV', kml: 'KML', shapefile: 'Shapefile ZIP' }

export function ImportDataSheet({ projectId, existingRecords, defaultCrs = 'EPSG:4326', onClose, onImport }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [format, setFormat] = useState<ImportFormat | null>(null)
  const [csvPreview, setCsvPreview] = useState<CsvPreview | null>(null)
  const [xField, setXField] = useState('')
  const [yField, setYField] = useState('')
  const [sourceCrs, setSourceCrs] = useState(defaultCrs)
  const [prepared, setPrepared] = useState<FieldRecord[]>([])
  const [warnings, setWarnings] = useState<string[]>([])
  const [acknowledged, setAcknowledged] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const resetAnalysis = () => { setPrepared([]); setWarnings([]); setAcknowledged(false); setError('') }

  const analysePrepared = (records: FieldRecord[], nextWarnings: string[] = []) => {
    const distanceWarning = projectDistanceWarning(records, existingRecords)
    setPrepared(records)
    setWarnings(distanceWarning ? [...nextWarnings, distanceWarning] : nextWarnings)
    setError(records.length ? '' : 'No supported point, line or polygon features were found.')
  }

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0]
    if (!selected) return
    setFile(selected); resetAnalysis(); setCsvPreview(null); setBusy(true)
    const extension = selected.name.split('.').pop()?.toLowerCase()
    try {
      if (extension === 'csv') {
        setFormat('csv')
        const preview = await parseCsv(selected)
        setCsvPreview(preview); setXField(preview.suggestedX); setYField(preview.suggestedY)
        if (!preview.suggestedX || !preview.suggestedY) setWarnings(['Coordinate columns could not be identified automatically. Select them before validating.'])
      } else if (extension === 'kml') {
        setFormat('kml'); setSourceCrs('EPSG:4326')
        analysePrepared(geoJsonToRecords(projectId, await parseKml(selected), selected.name, 'EPSG:4326'))
      } else if (extension === 'zip') {
        setFormat('shapefile')
        const result = await parseShapefile(selected)
        const shapefileWarnings = [!result.hasPrj ? 'No .prj file was found. The coordinates must already be WGS 84; otherwise the import location will be wrong.' : '', !result.hasDbf ? 'No .dbf attribute table was found. Geometry can be imported, but attributes may be missing.' : ''].filter(Boolean)
        analysePrepared(geoJsonToRecords(projectId, result.collection, selected.name, result.hasPrj ? 'Shapefile .prj → WGS 84' : 'Assumed EPSG:4326'), shapefileWarnings)
      } else {
        throw new Error('Choose a .csv, .kml, or zipped Shapefile (.zip).')
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The file could not be read.')
    } finally {
      setBusy(false); event.target.value = ''
    }
  }

  const validateCsv = () => {
    if (!file || !csvPreview) return
    resetAnalysis()
    try { analysePrepared(csvToRecords(projectId, csvPreview, xField, yField, sourceCrs, file.name)) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'CSV coordinates could not be validated.') }
  }

  const commit = () => {
    if (!prepared.length || (warnings.length && !acknowledged)) return
    onImport(prepared)
  }

  return (
    <div className="sheet-backdrop solid" role="presentation">
      <section className="bottom-sheet import-sheet" role="dialog" aria-modal="true" aria-labelledby="import-heading">
        <div className="sheet-handle" />
        <div className="sheet-heading"><div><p className="eyebrow">Project data</p><h2 id="import-heading">Import a spatial layer</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close import"><X size={21} /></button></div>
        <p className="sheet-intro">Import points, lines and areas. Every geometry is validated in WGS 84 before it reaches the project.</p>

        <div className="form-scroll">
          <label className="file-drop">
            <FileUp size={25} />
            <span><strong>{file ? file.name : 'Choose a spatial file'}</strong><small>CSV · KML · zipped Shapefile</small></span>
            <input type="file" accept=".csv,.kml,.zip" onChange={handleFile} />
          </label>

          {file && format && <div className="import-file-summary">{format === 'csv' ? <FileSpreadsheet size={18} /> : format === 'shapefile' ? <FileArchive size={18} /> : <MapPinned size={18} />}<span><strong>{formatName[format]}</strong><small>{(file.size / 1024).toFixed(file.size > 1024 * 100 ? 0 : 1)} KB</small></span>{busy && <span className="spinner" />}</div>}

          {format === 'csv' && csvPreview && (
            <section className="csv-config">
              <h3>Coordinate mapping</h3>
              <div className="two-fields">
                <label className="field-label"><span>X / longitude</span><span className="select-wrap"><select value={xField} onChange={(event) => setXField(event.target.value)}><option value="">Choose column</option>{csvPreview.columns.map((column) => <option key={column}>{column}</option>)}</select><ChevronDown size={17} /></span></label>
                <label className="field-label"><span>Y / latitude</span><span className="select-wrap"><select value={yField} onChange={(event) => setYField(event.target.value)}><option value="">Choose column</option>{csvPreview.columns.map((column) => <option key={column}>{column}</option>)}</select><ChevronDown size={17} /></span></label>
              </div>
              <label className="field-label"><span>Source coordinate system</span><span className="select-wrap"><select value={sourceCrs} onChange={(event) => setSourceCrs(event.target.value)}>{CRS_OPTIONS.map((crs) => <option value={crs.code} key={crs.code}>{crs.code} · {crs.label}</option>)}</select><ChevronDown size={17} /></span></label>
              <button type="button" className="secondary-button validate-button" onClick={validateCsv}>Validate {csvPreview.rows.length} rows</button>
            </section>
          )}

          {error && <div className="import-alert error"><AlertTriangle size={19} /><span><strong>Import blocked</strong><small>{error}</small></span></div>}
          {warnings.map((warning) => <div className="import-alert warning" key={warning}><AlertTriangle size={19} /><span><strong>Check the coordinate system</strong><small>{warning}</small></span></div>)}
          {prepared.length > 0 && <div className="import-alert success"><CheckCircle2 size={19} /><span><strong>{prepared.length} {prepared.length === 1 ? 'feature' : 'features'} ready</strong><small>Coordinates passed WGS 84 range validation.</small></span></div>}
          {warnings.length > 0 && prepared.length > 0 && <label className="acknowledge"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} /><span>I checked the source CRS and the project location is correct.</span></label>}
        </div>

        <div className="sheet-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="button" className="primary-button" disabled={!prepared.length || Boolean(warnings.length && !acknowledged)} onClick={commit}>Import {prepared.length || ''} features</button></div>
      </section>
    </div>
  )
}
