import { Capacitor } from '@capacitor/core'

import { jobSummary } from '../lib/insights'

import { AlertTriangle, ArrowLeft, Braces, CheckCircle2, Download, FileArchive, FileSpreadsheet, FileText, Image, MapPinned, Plus, Share2, Trash2, X } from 'lucide-react'

import { useMemo, useState } from 'react'

import { downloadHandover, downloadCsv, downloadGeoJson, downloadKml, downloadShapefile } from '../lib/export'

import { DEFAULT_MUDMAP_OPTIONS, downloadMudmapPages, renderMudmapSvg, type MudmapOptions, type MudmapPageSpec } from '../lib/report'

import { BASEMAPS, type BasemapId } from '../lib/basemaps'

import type { FileAction } from '../lib/nativeShare'

import type { FieldRecord, Project, UserProfile, WeatherSnapshot } from '../types'

import { ReportComposer } from './ReportComposer'

import { MudmapExtentMap } from './MudmapExtentMap'



type ExportFormat = 'handover' | 'geojson' | 'csv' | 'kml' | 'shapefile' | 'mudmap'

type Props = { project: Project; records: FieldRecord[]; profile: UserProfile; weather: WeatherSnapshot | null; weatherInOutputs: boolean; onClose: () => void }

const formats: Array<{ id: ExportFormat; name: string; hint: string; icon: typeof Braces }> = [

  { id: 'shapefile', name: 'Legacy GIS · Shapefile', hint: 'ZIP for older GIS tools; limited attributes', icon: FileArchive }, { id: 'kml', name: 'Google Earth · KML', hint: 'View your features in Google Earth', icon: Image }, { id: 'csv', name: 'Spreadsheet · CSV', hint: 'One row per feature, measurements and custom fields', icon: FileSpreadsheet }, { id: 'geojson', name: 'GIS data · GeoJSON', hint: 'Geometry, attributes and position metadata', icon: Braces },

]



export function ExportDataSheet({ project, records, profile, weather, weatherInOutputs, onClose }: Props) {

  const summary = jobSummary(records)

  const [advanced, setAdvanced] = useState(false)

  const [view, setView] = useState<'list' | 'mudmap' | 'extent' | 'report'>('list')

  const [busy, setBusy] = useState<string | null>(null)

  const [error, setError] = useState('')

  const [message, setMessage] = useState('')

  const [mudmapOptions, setMudmapOptions] = useState<MudmapOptions>({ ...DEFAULT_MUDMAP_OPTIONS, showWeather: weatherInOutputs, pointColor: '#31c4d6', lineColor: '#31c4d6', areaColor: '#7f9299', routeColor: '#20272a', labelColor: '#171717' })

  const [mudmapFormat, setMudmapFormat] = useState<'png' | 'svg' | 'pdf' | 'doc' | 'html'>('png')

  const [primaryColor, setPrimaryColor] = useState('#31c4d6')

  const [secondaryColor, setSecondaryColor] = useState('#171717')

  const [mapPages, setMapPages] = useState<MudmapPageSpec[]>(() => [{ id: crypto.randomUUID(), title: 'Overview', recordIds: records.map((record) => record.id), extentPaddingPercent: 15 }])

  const [activePageId, setActivePageId] = useState(() => mapPages[0].id)

  const activePage = (mapPages.find((page) => page.id === activePageId) ?? mapPages[0])!

  const previewRecords = records.filter((record) => activePage?.recordIds.includes(record.id))

  const preview = useMemo(() => view === 'mudmap' && previewRecords.length ? renderMudmapSvg({ ...project, name: `${project.name} · ${activePage.title}` }, previewRecords, 1100, 720, { ...mudmapOptions, extentPaddingPercent: activePage.extentPaddingPercent }, activePage.extent, weather) : '', [view, mudmapOptions, project, previewRecords, activePage, weather])

  const update = <Key extends keyof MudmapOptions>(key: Key, value: MudmapOptions[Key]) => setMudmapOptions((current) => ({ ...current, [key]: value }))

  const chooseBasemap = (basemap: BasemapId) => setMudmapOptions((current) => ({ ...current, basemap, backgroundColor: ({ streets: '#edf0e9', satellite: '#26352f', light: '#f8faf7', none: '#ffffff' })[basemap], labelColor: basemap === 'satellite' ? '#ffffff' : '#18312d' }))

  const run = async (format: ExportFormat, action: FileAction) => {

    setBusy(`${format}-${action}`); setError(''); setMessage('')

    try {

      let delivered: { action: FileAction } | undefined

      if (format === 'handover') delivered = await downloadHandover(project, records, action)

      if (format === 'geojson') delivered = await downloadGeoJson(project, records, action)

      if (format === 'csv') delivered = await downloadCsv(project, records, action)

      if (format === 'kml') delivered = await downloadKml(project, records, action)

      if (format === 'shapefile') delivered = await downloadShapefile(project, records, action)

      if (format === 'mudmap') await downloadMudmapPages(project, records, mapPages, mudmapOptions, mudmapFormat, action, weather)

      setMessage(delivered?.action === 'share' ? 'File passed to your sharing service.' : Capacitor.isNativePlatform() ? (action === 'save' ? 'Saved to Documents / FieldNote.' : 'Sharing action completed.') : 'Download requested. Check your browser downloads.')

    } catch (cause) { if (cause instanceof Error && cause.name === 'AbortError') return; setError(cause instanceof Error ? cause.message : 'The export could not be created.') }

    finally { setBusy(null) }

  }

  const feedback = <>{message && <div className="import-alert success"><CheckCircle2 /><span><strong>Done</strong><small>{message}</small></span></div>}{error && <div className="import-alert error"><AlertTriangle /><span><strong>Export failed</strong><small>{error}</small></span></div>}</>

  return <div className="sheet-backdrop solid"><section className="bottom-sheet export-sheet" role="dialog" aria-modal="true" aria-label="Export job">

    {view === 'report' ? <><ReportComposer project={project} records={records} profile={profile} weather={weather} weatherInOutputs={weatherInOutputs} primaryColor={primaryColor} secondaryColor={secondaryColor} onBack={() => setView('list')} onDone={(text) => { setMessage(text); setError('') }} onError={(text) => { setError(text); setMessage('') }} />{feedback}</> : view === 'list' ? <>

      <div className="sheet-handle"/><div className="sheet-heading"><div><p className="eyebrow">Project output</p><h2>Export this job</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Close exports"><X /></button></div>

      <p className="sheet-intro"><strong>{project.code} · {project.name}</strong><br/>{records.length} records · {summary.photos} photos. Choose what the recipient needs.</p>

      <div className="handover-card"><span className="eyebrow">Recommended · everything in one ZIP</span><h3>Hand over this job</h3><p>Spreadsheet, map data, original observations and photos. Includes a guide that explains every file and its units.</p><div className="dual-delivery"><button className="primary-button" disabled={Boolean(busy) || !records.length} onClick={() => run('handover', 'save')}><Download size={18}/>{busy?.startsWith('handover') ? 'Preparing…' : 'Download job ZIP'}</button><button className="secondary-button" disabled={Boolean(busy) || !records.length} onClick={() => run('handover', 'share')}><Share2 size={18}/>Share</button></div></div>

      {summary.review > 0 && <p className="field-help">{summary.review} records have field checks. Their review reasons are included; exporting does not mark them complete.</p>}

      <div className="output-featured"><button type="button" onClick={() => setView('report')}><span><FileText /></span><span><strong>Photo report</strong><small>A readable report for your client or team</small></span></button><button type="button" onClick={() => setView('mudmap')}><span><MapPinned /></span><span><strong>Site map</strong><small>A map image or PDF for a brief or site visit</small></span></button></div>

      <button className="secondary-button export-advanced-toggle" onClick={() => setAdvanced(!advanced)} aria-expanded={advanced}>{advanced ? 'Hide individual formats' : 'Need a spreadsheet or GIS file?'}</button>{advanced && <div className="export-rows">{formats.map(({ id, name, hint, icon: Icon }) => <div key={id}><span className="export-row-icon"><Icon /></span><span className="export-row-copy"><strong>{name}</strong><small>{hint}</small></span><button type="button" disabled={Boolean(busy)} onClick={() => run(id, 'save')}><Download /><span>Save</span></button><button type="button" disabled={Boolean(busy)} onClick={() => run(id, 'share')}><Share2 /><span>Share</span></button></div>)}</div>}

      {feedback}<p className="export-note">GIS exports use WGS 84 longitude/latitude. For original photos, use the job ZIP. Save downloads in a browser or writes to Documents / FieldNote in the phone app.</p>

    </> : view === 'extent' ? <>

      <div className="sheet-heading"><div className="composer-heading"><button type="button" className="icon-button" onClick={() => setView('mudmap')}><ArrowLeft /></button><div><p className="eyebrow">Map page extents</p><h2>Build the map book</h2></div></div><button className="icon-button" type="button" onClick={onClose} aria-label="Close exports"><X /></button></div>

      <div className="extent-editor-scroll"><div className="map-page-tabs">{mapPages.map((page, index) => <button type="button" className={page.id === activePage.id ? 'active' : ''} key={page.id} onClick={() => setActivePageId(page.id)}>{index + 1}<span>{page.title}</span></button>)}<button type="button" className="add-page" onClick={() => { const page = { id: crypto.randomUUID(), title: `Map page ${mapPages.length + 1}`, recordIds: records.map((record) => record.id), extentPaddingPercent: 15 }; setMapPages((pages) => [...pages, page]); setActivePageId(page.id) }}><Plus/><span>Add page</span></button></div>

        {previewRecords.length ? <MudmapExtentMap pageId={activePage.id} records={previewRecords} basemap={mudmapOptions.basemap} extent={activePage.extent} primaryColor={primaryColor} secondaryColor={secondaryColor} onExtentChange={(extent) => setMapPages((pages) => pages.map((page) => page.id === activePage.id ? { ...page, extent } : page))}/> : <div className="mudmap-preview extent-preview"><div className="extent-empty"><MapPinned/><strong>Select observations for this page</strong><small>Then pan and pinch-zoom the live map to frame it.</small></div></div>}

        <div className="extent-page-settings"><div className="extent-title-row"><label className="field-label"><span>Page title</span><input value={activePage.title} onChange={(event) => setMapPages(mapPages.map((page) => page.id === activePage.id ? { ...page, title: event.target.value } : page))}/></label>{mapPages.length > 1 && <button type="button" className="danger-icon" onClick={() => { const remaining = mapPages.filter((page) => page.id !== activePage.id); setMapPages(remaining); setActivePageId(remaining[0].id) }}><Trash2/></button>}</div>

          <fieldset className="composer-group"><legend>Geometry on this page ({activePage.recordIds.length}/{records.length})</legend><div className="extent-select-actions"><button type="button" onClick={() => setMapPages(mapPages.map((page) => page.id === activePage.id ? { ...page, recordIds: records.map((record) => record.id) } : page))}>All</button><button type="button" onClick={() => setMapPages(mapPages.map((page) => page.id === activePage.id ? { ...page, recordIds: [] } : page))}>None</button></div><div className="composer-records">{records.map((record, index) => <label key={record.id}><input type="checkbox" checked={activePage.recordIds.includes(record.id)} onChange={() => setMapPages(mapPages.map((page) => page.id === activePage.id ? { ...page, recordIds: page.recordIds.includes(record.id) ? page.recordIds.filter((id) => id !== record.id) : [...page.recordIds, record.id] } : page))}/><span><b>{index + 1}</b><span><strong>{record.label}</strong><small>{record.category} · {record.mode}</small></span></span></label>)}</div></fieldset>

        </div>

      </div><div className="sheet-actions"><button type="button" className="secondary-button" onClick={() => setView('mudmap')}>Done · {mapPages.length} page{mapPages.length === 1 ? '' : 's'}</button></div>

    </> : <>

      <div className="sheet-heading"><div className="composer-heading"><button type="button" className="icon-button" onClick={() => setView('list')}><ArrowLeft /></button><div><p className="eyebrow">Map composer</p><h2>Design mudmap</h2></div></div><button className="icon-button" type="button" onClick={onClose} aria-label="Close exports"><X /></button></div>

      <div className="mudmap-composer-scroll"><div className="mudmap-preview" dangerouslySetInnerHTML={{ __html: preview }}/><div className="mudmap-settings">

        <fieldset className="mudmap-fieldset output-scheme"><legend>Output colour scheme</legend><div className="two-fields"><label><input type="color" value={primaryColor} onChange={(event) => { const color = event.target.value; setPrimaryColor(color); setMudmapOptions((current) => ({ ...current, pointColor: color, lineColor: color, areaColor: color, routeColor: color })) }}/><span><strong>Primary</strong><small>Geometry and accents</small></span></label><label><input type="color" value={secondaryColor} onChange={(event) => { const color = event.target.value; setSecondaryColor(color); setMudmapOptions((current) => ({ ...current, labelColor: color })) }}/><span><strong>Secondary</strong><small>Text and framing</small></span></label></div></fieldset>

        <div className="two-fields"><label className="field-label"><span>File type</span><select value={mudmapFormat} onChange={(event) => setMudmapFormat(event.target.value as typeof mudmapFormat)}><option value="png">PNG image</option><option value="pdf">PDF map</option><option value="doc">Word DOC</option><option value="html">Interactive HTML</option><option value="svg">Editable SVG</option></select></label><label className="field-label"><span>Basemap</span><select value={mudmapOptions.basemap} onChange={(event) => chooseBasemap(event.target.value as BasemapId)}>{Object.values(BASEMAPS).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>

        <div className="two-fields"><label className="field-label"><span>Point symbol</span><select value={mudmapOptions.pointSymbol} onChange={(event) => update('pointSymbol', event.target.value as MudmapOptions['pointSymbol'])}><option value="pin">Pin</option><option value="circle">Circle</option><option value="square">Square</option><option value="triangle">Triangle</option></select></label><label className="field-label"><span>Labels</span><select value={mudmapOptions.labelMode} onChange={(event) => update('labelMode', event.target.value as MudmapOptions['labelMode'])}><option value="both">Number + label</option><option value="number">Number only</option><option value="label">Label only</option><option value="none">No labels</option></select></label></div>

        <button type="button" className="map-pages-launch" onClick={() => setView('extent')}><MapPinned/><span><strong>Set map pages and extents</strong><small>{mapPages.length} page{mapPages.length === 1 ? '' : 's'} · choose records and frame scale for each page</small></span></button>

        <fieldset className="mudmap-fieldset"><legend>Layers</legend><div className="mudmap-checks">{([['showPoints','Points'],['showLines','Lines'],['showAreas','Areas'],['showRoutes','Routes'],['showGrid','Grid'],['showScale','Scale bar'],['showNorthArrow','North arrow'],['showLegend','Legend']] as Array<[keyof MudmapOptions,string]>).map(([key,label]) => <label key={key}><input type="checkbox" checked={Boolean(mudmapOptions[key])} onChange={(event) => update(key,event.target.checked as never)}/> {label}</label>)}</div></fieldset>

        <fieldset className="mudmap-fieldset"><legend>Colours</legend><div className="mudmap-colours">{([['backgroundColor','Background'],['pointColor','Points'],['lineColor','Lines'],['areaColor','Areas'],['routeColor','Routes'],['labelColor','Labels']] as Array<[keyof MudmapOptions,string]>).map(([key,label]) => <label key={key}><input type="color" value={String(mudmapOptions[key])} onChange={(event) => update(key,event.target.value as never)}/><span>{label}</span></label>)}</div></fieldset>

      </div></div>{feedback}<div className="sheet-actions dual-delivery"><button className="secondary-button" type="button" disabled={Boolean(busy)} onClick={() => run('mudmap','share')}><Share2 /> Share</button><button className="primary-button" type="button" disabled={Boolean(busy)} onClick={() => run('mudmap','save')}><Download /> Save to device</button></div>

    </>}

  </section></div>

}

