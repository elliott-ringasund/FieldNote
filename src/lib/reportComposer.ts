import { downloadBlob, projectSlug } from './export'
import type { FileAction } from './nativeShare'
import { DEFAULT_MUDMAP_OPTIONS, renderMudmapRasterSvg, renderMudmapSvg, type MudmapOptions } from './report'
import { formatArea, formatDistance, lineLengthMetres, polygonAreaSquareMetres } from './geo'
import type { Attachment, FieldRecord, Project, UserProfile, WeatherSnapshot } from '../types'

const esc = (value: unknown) => String(value ?? '').replace(/[<>&'"]/g, (character) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&#39;', '"': '&quot;' })[character]!)

export type ReportSectionId = 'cover' | 'map' | 'summary' | 'observations' | 'photoIndex' | 'weather' | 'disclaimer'
export type ReportOptions = {
  recordIds: string[]
  sections: ReportSectionId[]
  includeGeometry: boolean
  includeAttributes: boolean
  includeCoordinates: boolean
  includeAccuracy: boolean
  includePhotos: boolean
  includeComments: boolean
  includeTimestamps: boolean
  includeAuthor: boolean
  includeWeather: boolean
  primaryColor: string
  secondaryColor: string
}

export const REPORT_SECTION_LABELS: Record<ReportSectionId, string> = {
  cover: 'Cover & job details', map: 'Project map', summary: 'Observation summary', observations: 'Observation details', photoIndex: 'Photo index', weather: 'Field weather', disclaimer: 'Accuracy note',
}

export function defaultReportOptions(records: FieldRecord[]): ReportOptions {
  return { recordIds: records.map((record) => record.id), sections: ['cover', 'map', 'summary', 'observations', 'photoIndex', 'weather', 'disclaimer'], includeGeometry: true, includeAttributes: true, includeCoordinates: true, includeAccuracy: true, includePhotos: true, includeComments: true, includeTimestamps: true, includeAuthor: true, includeWeather: true, primaryColor: '#31c4d6', secondaryColor: '#20272a' }
}

function measurement(record: FieldRecord) {
  if (record.mode === 'area') return formatArea(polygonAreaSquareMetres(record.coordinates))
  if (record.mode === 'line' || record.mode === 'route') return formatDistance(lineLengthMetres(record.coordinates))
  return 'Point'
}

function reportMapOptions(options: ReportOptions): MudmapOptions {
  return {
    ...DEFAULT_MUDMAP_OPTIONS,
    pointColor: options.primaryColor,
    lineColor: options.primaryColor,
    areaColor: options.primaryColor,
    routeColor: options.primaryColor,
    labelColor: options.secondaryColor,
    showWeather: options.includeWeather,
  }
}

function hexRgb(value: string, fallback: [number, number, number]): [number, number, number] {
  const match = /^#?([0-9a-f]{6})$/i.exec(value)
  if (!match) return fallback
  return [Number.parseInt(match[1].slice(0, 2), 16), Number.parseInt(match[1].slice(2, 4), 16), Number.parseInt(match[1].slice(4, 6), 16)]
}

function photo(attachment: Attachment) {
  const coordinate = attachment.coordinate ? ` · ${attachment.coordinate.latitude.toFixed(6)}, ${attachment.coordinate.longitude.toFixed(6)}` : ''
  return `<figure><img src="${attachment.dataUrl}" alt="${esc(attachment.caption || attachment.name)}"><figcaption>${esc(attachment.caption || attachment.name)} · ${esc(new Date(attachment.capturedAt).toLocaleString())}${coordinate}</figcaption></figure>`
}

function observation(record: FieldRecord, index: number, options: ReportOptions) {
  const accuracies = record.coordinates.map((item) => item.accuracy).filter((value): value is number => typeof value === 'number')
  const first = record.coordinates[0]
  const standard: Array<[string, unknown]> = [['Status', record.status], ['Operative', record.operative], ['Geometry', record.mode], ['Measurement', measurement(record)]]
  if (options.includeTimestamps) standard.push(['Collected', new Date(record.createdAt).toLocaleString()])
  if (options.includeAccuracy) standard.push(['GPS accuracy', accuracies.length ? `±${Math.max(...accuracies).toFixed(1)} m (worst)` : 'Not available'])
  if (options.includeCoordinates) standard.push(['Coordinates', first ? `${first.latitude.toFixed(7)}, ${first.longitude.toFixed(7)}` : 'None'])
  if (options.includeAttributes) standard.push(...Object.entries(record.attributes ?? {}))
  const details = standard.map(([key, value]) => `<div><dt>${esc(key)}</dt><dd>${esc(value)}</dd></div>`).join('')
  const geometry = options.includeGeometry ? `<div class="geometry-strip"><strong>GEOMETRY</strong><span>${record.mode.toUpperCase()} · ${record.coordinates.length} position${record.coordinates.length === 1 ? '' : 's'} · ${esc(measurement(record))}${first ? ` · ${first.latitude.toFixed(6)}, ${first.longitude.toFixed(6)}` : ''}</span></div>` : ''
  const comments = options.includeComments ? `<section><h3>Comments</h3><p class="comments">${esc(record.notes || 'No comments recorded.')}</p></section>` : ''
  const photos = options.includePhotos && record.attachments.length ? `<section><h3>Photographs</h3><div class="photos">${record.attachments.map(photo).join('')}</div></section>` : ''
  return `<article id="observation-${esc(record.id)}" class="observation" data-record-id="${esc(record.id)}" data-mode="${record.mode}" tabindex="0"><div class="record-head"><b>${String(index + 1).padStart(2, '0')}</b><div><small>${esc(record.category)} // ${record.mode}</small><h2>${esc(record.label)}</h2></div><strong>${esc(measurement(record))}</strong></div>${geometry}<section><h3>Details & attributes</h3><dl>${details}</dl></section>${comments}${photos}</article>`
}

function weatherPanel(weather: WeatherSnapshot | null) {
  if (!weather) return '<p class="empty">No live weather snapshot was captured for this report.</p>'
  return `<div class="weather-grid"><div><strong>${weather.temperature.toFixed(1)}°C</strong><small>Temperature</small></div><div><strong>${weather.windSpeed.toFixed(0)} km/h</strong><small>Wind · ${weather.windDirection.toFixed(0)}°</small></div><div><strong>${weather.relativeHumidity}%</strong><small>Humidity</small></div><div><strong>${weather.precipitation.toFixed(1)} mm</strong><small>Precipitation</small></div><div><strong>${weather.cloudCover}%</strong><small>Cloud cover</small></div><div><strong>${weather.windGusts.toFixed(0)} km/h</strong><small>Gusts</small></div></div><p class="source">Open-Meteo snapshot · ${esc(new Date(weather.capturedAt).toLocaleString())} · ${weather.latitude.toFixed(5)}, ${weather.longitude.toFixed(5)}</p>`
}

function section(sectionId: ReportSectionId, project: Project, records: FieldRecord[], options: ReportOptions, profile: UserProfile, weather: WeatherSnapshot | null) {
  if (sectionId === 'cover') return `<header class="cover"><p class="kicker">FIELDNOTE // ${esc(project.code)}</p><h1>${esc(project.name)}</h1><p>${esc(project.client)} · ${records.length} selected observation${records.length === 1 ? '' : 's'}</p>${options.includeAuthor ? `<div class="author"><strong>${esc(profile.name || 'Field operative')}</strong><span>${esc(profile.company || 'Independent')}</span><span>${esc(profile.email)}</span></div>` : ''}<small>Generated ${esc(new Date().toLocaleString())}</small></header>`
  if (sectionId === 'map') return `<section class="report-section map-section"><div class="heading"><b>01</b><div><small>SPATIAL OVERVIEW</small><h2>Project map</h2></div></div><p class="map-help">Hover or tap geometry to highlight it. Click geometry to open its observation.</p><div class="map">${renderMudmapSvg(project, records, 1100, 720, reportMapOptions(options), undefined, weather)}</div></section>`
  if (sectionId === 'summary') return `<section class="report-section"><div class="heading"><b>02</b><div><small>REGISTER</small><h2>Observation summary</h2></div></div><div class="summary">${records.map((record, index) => `<button type="button" data-jump-id="${esc(record.id)}"><b>${String(index + 1).padStart(2, '0')}</b><span><strong>${esc(record.label)}</strong><small>${esc(record.category)} · ${record.mode} · ${record.status}</small></span><em>${esc(measurement(record))}</em></button>`).join('')}</div></section>`
  if (sectionId === 'observations') return `<section class="report-section"><div class="heading"><b>03</b><div><small>EVIDENCE REGISTER</small><h2>Observation details</h2></div></div>${records.map((record, index) => observation(record, index, options)).join('')}</section>`
  if (sectionId === 'photoIndex') return `<section class="report-section"><div class="heading"><b>04</b><div><small>EVIDENCE</small><h2>Photo index</h2></div></div><div class="photo-index">${records.flatMap((record, index) => record.attachments.map((item) => `<figure data-record-id="${esc(record.id)}"><img src="${item.dataUrl}" alt="${esc(item.caption || record.label)}"><figcaption><b>${index + 1} · ${esc(record.label)}</b><br>${esc(item.caption || item.name)}</figcaption></figure>`)).join('') || '<p class="empty">No photographs included.</p>'}</div></section>`
  if (sectionId === 'weather') return options.includeWeather ? `<section class="report-section"><div class="heading"><b>05</b><div><small>SITE CONDITIONS</small><h2>Field weather</h2></div></div>${weatherPanel(weather)}</section>` : ''
  return `<footer><strong>FIELD DATA NOTE</strong><p>Coordinates and measurements are indicative unless collected with a suitable calibrated survey instrument and verified workflow. Device accuracy values are estimates, not surveyed tolerances.</p></footer>`
}

function interactiveMapReport(project: Project, records: FieldRecord[], options: ReportOptions, profile: UserProfile, weather: WeatherSnapshot | null) {
  const map = options.sections.includes('map') ? renderMudmapSvg(project, records, 1100, 720, reportMapOptions(options), undefined, weather) : ''
  const counts = records.reduce((result, record) => ({ ...result, [record.status]: (result[record.status] ?? 0) + 1 }), {} as Record<string, number>)
  const attention = records.filter((record) => record.status !== 'complete')
  const details = records.map((record, index) => observation(record, index, options)).join('')
  const weatherHtml = options.includeWeather && options.sections.includes('weather') ? weatherPanel(weather) : ''
  const author = options.includeAuthor ? `<div class="identity"><b>${esc(profile.name || 'Field operative')}</b><span>${esc(profile.company || 'Independent')}</span><span>${esc(profile.email)}</span></div>` : ''
  const summaryRows = `<table><tbody><tr><th>Client / team</th><td>${esc(project.client)}</td></tr><tr><th>Project</th><td>${esc(project.code)}</td></tr><tr><th>Scope</th><td>${records.length} selected observation${records.length === 1 ? '' : 's'}</td></tr><tr><th>Geometry</th><td>${records.filter((record) => record.mode === 'point').length} points · ${records.filter((record) => record.mode === 'line').length} lines · ${records.filter((record) => record.mode === 'area').length} areas · ${records.filter((record) => record.mode === 'route').length} routes</td></tr><tr><th>Result</th><td>${counts.complete ?? 0} complete · ${counts['needs-review'] ?? 0} review · ${counts['follow-up'] ?? 0} follow-up</td></tr><tr><th>Generated</th><td>${esc(new Date().toLocaleString())}</td></tr></tbody></table>`
  const list = records.map((record, index) => `<button class="record-link status-${record.status}" type="button" data-open-id="${esc(record.id)}"><b>${String(index + 1).padStart(2, '0')}</b><span><strong>${esc(record.label)}</strong><small>${esc(record.category)} · ${record.mode} · ${esc(measurement(record))}</small></span><em>${record.status}</em></button>`).join('')
  const attentionHtml = attention.length ? `<section class="attention"><strong>Items requiring attention</strong><p>${attention.map((record) => `<button type="button" data-open-id="${esc(record.id)}">${esc(record.label)}</button> — ${esc(options.includeComments ? record.notes || record.status : record.status)}`).join('<br>')}</p></section>` : '<section class="all-clear"><strong>No review or follow-up items in the selected observations.</strong></section>'
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(project.code)} · ${esc(project.name)}</title><style>:root{--orange:#ff7900;--navy:#172c4c;--blue:#2a8ee6;--green:#57bb4c;--yellow:#e9b51b;--red:#e24c3d;--ink:#17253a;--line:#d7dfe9;--panel:#f3f6fa}*{box-sizing:border-box}html,body{height:100%;margin:0;color:var(--ink);font:12px/1.45 Arial,sans-serif;overflow:hidden}.topbar{height:62px;padding:8px 14px;display:flex;align-items:center;gap:14px;color:white;background:var(--navy)}.terminal-mark{width:42px;height:42px;display:grid;place-items:center;border:2px solid var(--orange);color:var(--orange);font:900 18px monospace}.title{min-width:0;flex:1}.title b,.title span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.title b{font-size:14px}.title span{color:#c8d3e2;font-size:10px}.doc-ref{text-align:right}.doc-ref b,.doc-ref small{display:block}.doc-ref small{color:#c8d3e2}.workspace{height:calc(100% - 62px);display:grid;grid-template-columns:minmax(0,72%) minmax(320px,28%)}.map-pane{position:relative;overflow:hidden;background:#27323c}.map-pane>.map{width:100%;height:100%;overflow:auto;display:grid;place-items:center}.map svg{width:100%;min-width:780px;height:auto;transition:transform .15s}.map-help{position:absolute;z-index:3;left:10px;bottom:10px;padding:6px 9px;color:white;background:#101820cc;font:700 9px monospace}.map-tools{position:absolute;z-index:4;left:10px;top:10px;display:flex;flex-direction:column;gap:4px}.map-tools button,.map-tools label{min-width:38px;min-height:38px;padding:0 9px;display:grid;place-items:center;border:1px solid #c5ccd4;background:white;font-weight:900;cursor:pointer}.map-tools label{font-size:9px}.map-tools input{position:absolute;opacity:0}.panel{overflow-y:auto;background:white;border-left:1px solid #aeb9c7}.panel-inner{padding:15px}.panel h1{margin:0 0 7px;padding-bottom:7px;border-bottom:2px solid var(--navy);font-size:17px}.panel h2{margin:18px 0 8px;font-size:13px}.identity{padding:9px;display:flex;flex-wrap:wrap;gap:3px 10px;background:var(--panel)}.identity b{color:var(--orange)}table{width:100%;border-collapse:collapse}th,td{padding:7px;border:1px solid var(--line);vertical-align:top;text-align:left}th{width:42%;background:#e8eef5}.attention,.all-clear{margin-top:10px;padding:10px;border-left:4px solid var(--yellow);background:#fff2c7}.all-clear{border-color:var(--green);background:#eaf8e7}.attention button{padding:0;border:0;color:#846000;background:none;text-decoration:underline;font-weight:800;cursor:pointer}.legend{display:flex;flex-wrap:wrap;gap:5px 10px;margin:10px 0;color:#58687a;font-size:9px}.legend i{display:inline-block;width:18px;height:4px;margin-right:4px;vertical-align:middle}.filters{position:sticky;z-index:3;top:-15px;margin:12px -15px 8px;padding:8px 15px;display:grid;grid-template-columns:1fr auto;gap:6px;background:white;border-bottom:1px solid var(--line)}.filters input,.filters select{min-height:36px;padding:0 8px;border:1px solid var(--line)}.record-list{display:grid;gap:5px}.record-link{width:100%;padding:8px;display:grid;grid-template-columns:30px 1fr auto;align-items:center;gap:8px;border:1px solid var(--line);border-left:4px solid var(--green);text-align:left;background:white;cursor:pointer}.record-link.status-needs-review{border-left-color:var(--yellow)}.record-link.status-follow-up{border-left-color:var(--red)}.record-link:hover{background:#f1f6fb;border-color:var(--blue)}.record-link>b{font:900 11px monospace;color:var(--blue)}.record-link span{display:flex;min-width:0;flex-direction:column}.record-link strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.record-link small{color:#66778b}.record-link em{font-size:8px;font-style:normal;text-transform:uppercase}.detail-view{display:none}.detail-view.open{display:block}.summary-view.hidden{display:none}.back{margin-bottom:8px;padding:7px 10px;border:1px solid var(--line);background:white;font-weight:800;cursor:pointer}.observation{padding:0;border:0;outline:0}.record-head{display:flex;align-items:center;gap:9px;padding-bottom:8px;border-bottom:2px solid var(--navy)}.record-head>b{width:32px;height:32px;display:grid;place-items:center;background:var(--orange);font:900 11px monospace}.record-head>div{flex:1}.record-head h2{margin:0;font-size:17px}.record-head small{color:#66778b}.record-head>strong{font:800 10px monospace}.geometry-strip{margin:9px 0;padding:8px;color:white;background:#172333;font:9px monospace}.geometry-strip strong{color:var(--orange)}article h3{margin:12px 0 5px;color:#315982;font-size:11px}dl{margin:0;display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--line)}dl div{padding:7px;background:var(--panel)}dt{color:#67768a;font-size:8px;text-transform:uppercase}dd{margin:2px 0 0;font-weight:700;word-break:break-word}.comments{margin:0;padding:9px;border-left:4px solid var(--yellow);background:#fff4d5}.photos{display:grid;grid-template-columns:1fr 1fr;gap:7px}.photos figure{margin:0}.photos img{display:block;width:100%;height:150px;object-fit:cover;background:#ddd}.photos figcaption{padding:5px;background:var(--panel);font-size:8px}.weather-grid{display:grid;grid-template-columns:1fr 1fr;gap:4px}.weather-grid div{padding:8px;color:white;background:#182333}.weather-grid strong,.weather-grid small{display:block}.weather-grid strong{color:var(--orange);font:900 14px monospace}.source,.empty{color:#67768a;font-size:8px}.report-shape{pointer-events:all;transition:filter .12s,opacity .12s}.report-shape:hover,.report-shape.active{filter:drop-shadow(0 0 7px var(--orange));opacity:1}.print{width:100%;margin-top:12px;padding:10px;border:0;background:var(--orange);font-weight:900}@media(max-width:760px){html,body{overflow:auto}.topbar{height:auto;min-height:58px}.doc-ref{display:none}.workspace{height:auto;min-height:calc(100vh - 58px);grid-template-columns:1fr}.map-pane{height:54vh}.panel{height:auto;max-height:none;border-left:0}.map svg{min-width:640px}.photos{grid-template-columns:1fr}}@media print{html,body{height:auto;overflow:visible}.topbar,.map-tools,.map-help,.filters,.back{display:none}.workspace{height:auto;display:block}.map-pane{height:auto;break-after:page}.map-pane>.map{display:block}.map svg{min-width:0}.panel{overflow:visible;border:0}.summary-view.hidden{display:block}.detail-view{display:block;break-before:page}.record-list{display:none}.print{display:none}}</style></head><body><header class="topbar"><div class="terminal-mark">FN</div><div class="title"><b>${esc(project.name)} · ${esc(project.client)}</b><span>FIELD INSPECTION // ${records.length} OBSERVATIONS // ${esc(profile.company)}</span></div><div class="doc-ref"><b>${esc(project.code)}</b><small>${esc(new Date().toLocaleDateString())}</small></div></header><main class="workspace"><section class="map-pane"><div class="map-tools"><button type="button" data-zoom=".12">+</button><button type="button" data-zoom="-.12">−</button><button type="button" data-fit>FIT</button><label><input id="labels" type="checkbox" checked>LBL</label></div><div class="map" id="map">${map || '<p style="color:white">Map module excluded from this export.</p>'}</div><div class="map-help">CLICK GEOMETRY FOR DETAILS · HOVER TO HIGHLIGHT</div></section><aside class="panel"><div class="panel-inner"><div class="summary-view" id="summary"><h1>${esc(project.name)} — inspection summary</h1>${author}${options.sections.includes('summary') ? summaryRows : ''}${attentionHtml}<div class="legend"><span><i style="background:var(--green)"></i>Complete</span><span><i style="background:var(--yellow)"></i>Needs review</span><span><i style="background:var(--red)"></i>Follow-up</span></div>${weatherHtml ? `<h2>Field weather</h2>${weatherHtml}` : ''}<div class="filters"><input id="search" placeholder="Search observations"><select id="mode"><option value="">All geometry</option><option value="point">Points</option><option value="line">Lines</option><option value="area">Areas</option><option value="route">Routes</option></select></div><div class="record-list">${list}</div><button class="print" onclick="window.print()">PRINT / SAVE PDF</button></div><div class="detail-view" id="detail"><button type="button" class="back" id="back">← Back to summary</button>${details}<button class="print" onclick="window.print()">PRINT THIS VIEW</button></div></div></aside></main><script>(()=>{const summary=document.getElementById('summary'),detail=document.getElementById('detail'),cards=[...document.querySelectorAll('.observation')],links=[...document.querySelectorAll('.record-link')],shapes=[...document.querySelectorAll('.report-shape')],search=document.getElementById('search'),mode=document.getElementById('mode'),map=document.querySelector('#map svg');let scale=1;function highlight(id){shapes.forEach(el=>el.classList.toggle('active',el.dataset.recordId===id));}function open(id){summary.classList.add('hidden');detail.classList.add('open');cards.forEach(el=>el.style.display=el.dataset.recordId===id?'block':'none');highlight(id);document.querySelector('.panel').scrollTo({top:0,behavior:'smooth'});}function close(){summary.classList.remove('hidden');detail.classList.remove('open');cards.forEach(el=>el.style.display='');highlight('');}function filter(){const q=search.value.toLowerCase(),m=mode.value;links.forEach(el=>{const card=document.querySelector('.observation[data-record-id="'+CSS.escape(el.dataset.openId)+'"]');el.style.display=(!el.innerText.toLowerCase().includes(q)||(m&&card?.dataset.mode!==m))?'none':'grid';});}document.querySelectorAll('[data-open-id]').forEach(el=>el.addEventListener('click',()=>open(el.dataset.openId)));shapes.forEach(el=>{el.style.cursor='pointer';el.addEventListener('mouseenter',()=>highlight(el.dataset.recordId));el.addEventListener('mouseleave',()=>highlight(''));el.addEventListener('click',()=>open(el.dataset.recordId));});document.getElementById('back').addEventListener('click',close);search.addEventListener('input',filter);mode.addEventListener('change',filter);document.querySelectorAll('[data-zoom]').forEach(el=>el.addEventListener('click',()=>{scale=Math.max(.5,Math.min(2.5,scale+Number(el.dataset.zoom)));if(map)map.style.transform='scale('+scale+')';}));document.querySelector('[data-fit]').addEventListener('click',()=>{scale=1;if(map)map.style.transform='scale(1)';});document.getElementById('labels').addEventListener('change',event=>document.querySelectorAll('.feature-label').forEach(el=>el.style.display=event.target.checked?'':'none'));})();</script></body></html>`
}

export function buildInteractiveReportHtml(project: Project, allRecords: FieldRecord[], supplied?: ReportOptions, profile: UserProfile = { name: '', company: '', email: '' }, weather: WeatherSnapshot | null = null, interactive = true) {
  const options = { ...defaultReportOptions(allRecords), ...supplied }
  const chosen = new Set(options.recordIds)
  const records = allRecords.filter((record) => chosen.has(record.id))
  if (!records.length) throw new Error('Select at least one observation for the report.')
  if (interactive) return interactiveMapReport(project, records, options, profile, weather).replace('--orange:#ff7900', `--orange:${options.primaryColor}`).replace('--navy:#172c4c', `--navy:${options.secondaryColor}`)
  const content = options.sections.map((item) => section(item, project, records, options, profile, weather)).join('')
  const toolbar = interactive ? `<nav><i></i><input id="search" placeholder="Search observations, attributes or comments"><select id="mode"><option value="">All geometry</option><option value="point">Points</option><option value="line">Lines</option><option value="area">Areas</option><option value="route">Routes</option></select><button onclick="window.print()">PRINT / PDF</button></nav>` : ''
  const script = interactive ? `<script>(()=>{const cards=[...document.querySelectorAll('.observation')],shapes=[...document.querySelectorAll('.report-shape')],search=document.getElementById('search'),mode=document.getElementById('mode');function active(id,scroll){cards.forEach(el=>el.classList.toggle('active',el.dataset.recordId===id));shapes.forEach(el=>el.classList.toggle('active',el.dataset.recordId===id));if(scroll)document.getElementById('observation-'+id)?.scrollIntoView({behavior:'smooth',block:'start'});}function filter(){const q=search.value.toLowerCase(),m=mode.value;cards.forEach(el=>el.classList.toggle('hidden',!el.innerText.toLowerCase().includes(q)||(m&&el.dataset.mode!==m)));}cards.forEach(el=>['mouseenter','focus','click'].forEach(event=>el.addEventListener(event,()=>active(el.dataset.recordId,false))));shapes.forEach(el=>{el.style.cursor='pointer';el.addEventListener('mouseenter',()=>active(el.dataset.recordId,false));el.addEventListener('click',()=>active(el.dataset.recordId,true));});document.querySelectorAll('[data-jump-id]').forEach(el=>el.addEventListener('click',()=>active(el.dataset.jumpId,true)));search.addEventListener('input',filter);mode.addEventListener('change',filter);})();</script>` : ''
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(project.code)} · ${esc(project.name)}</title><style>@page{size:A4;margin:14mm}:root{--o:${options.primaryColor};--ink:${options.secondaryColor};--muted:#68727a;--line:#dfe3e6;--panel:#f3f5f6}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;color:var(--ink);background:#e8ebed;font:13px/1.5 Arial,sans-serif}nav{position:sticky;z-index:20;top:0;display:flex;gap:8px;padding:10px max(12px,calc((100% - 1080px)/2));background:var(--ink);border-bottom:1px solid #34383e}nav i{width:10px;background:var(--o)}nav input,nav select,nav button{min-height:42px;border:1px solid #363b42;border-radius:3px}nav input{min-width:0;flex:1;padding:0 12px;color:white;background:#1d2025}nav select{padding:0 10px;color:#eee;background:#1d2025}nav button{padding:0 15px;background:var(--o);font-weight:900}.report{width:min(1080px,100%);margin:auto;padding:24px;background:white}.cover{min-height:310px;padding:44px;border-left:9px solid var(--o);color:white;background:var(--ink)}.kicker{color:var(--o);font:800 12px monospace;letter-spacing:.12em}.cover h1{max-width:700px;margin:36px 0 10px;font-size:45px;line-height:1.03}.cover>p{color:#bac1c6}.cover>small{display:block;margin-top:28px;color:#858d94}.author{display:flex;flex-wrap:wrap;gap:6px 18px;margin-top:35px}.author strong{color:var(--o)}.report-section{padding:42px 0;border-bottom:1px solid var(--line)}.heading{display:flex;align-items:center;gap:14px;margin-bottom:20px}.heading>b{font:900 28px monospace;color:var(--o)}.heading small{color:var(--muted);font:800 9px monospace;letter-spacing:.13em}.heading h2{margin:0;font-size:25px}.map-help,.source,.empty{color:var(--muted)}.map{overflow:auto;border:1px solid var(--line);background:#eef1f2}.map svg{display:block;width:100%;height:auto}.report-shape{transition:filter .12s,opacity .12s}.report-shape:hover,.report-shape.active{filter:drop-shadow(0 0 7px var(--o));opacity:1}.summary{display:grid;gap:6px}.summary button{width:100%;padding:12px;display:grid;grid-template-columns:44px 1fr auto;align-items:center;gap:12px;border:1px solid var(--line);text-align:left;background:white;cursor:pointer}.summary button:hover{border-color:var(--o);background:#fff8f1}.summary button>b{font:900 17px monospace;color:var(--o)}.summary span{display:flex;flex-direction:column}.summary small{color:var(--muted)}.summary em{font-style:normal;font-weight:800}.observation{margin:0 0 18px;padding:22px;border:1px solid var(--line);break-inside:avoid;transition:.15s}.observation:hover,.observation.active{border-color:var(--o);box-shadow:inset 5px 0 var(--o)}.observation.hidden{display:none}.record-head{display:flex;align-items:center;gap:13px}.record-head>b{width:36px;height:36px;display:grid;place-items:center;color:#111;background:var(--o);font:900 13px monospace}.record-head>div{flex:1}.record-head small{color:var(--o);font:800 9px monospace}.record-head h2{margin:2px 0 0;font-size:20px}.record-head>strong{font-family:monospace}.geometry-strip{margin:17px 0;padding:11px;display:flex;gap:14px;color:#dfe4e7;background:var(--ink);font-family:monospace}.geometry-strip strong{color:var(--o)}article h3{margin:19px 0 8px;font-size:11px;text-transform:uppercase;letter-spacing:.08em}dl{margin:0;display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--line)}dl div{padding:10px;background:var(--panel)}dt{color:var(--muted);font-size:9px;text-transform:uppercase}dd{margin:2px 0 0;font-weight:700;word-break:break-word}.comments{margin:0;padding:12px;border-left:3px solid var(--o);background:#fff8f1}.photos,.photo-index{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}figure{margin:0}figure img{display:block;width:100%;max-height:330px;object-fit:cover;background:#ddd}figcaption{padding:7px;color:var(--muted);font-size:10px;background:var(--panel)}.weather-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}.weather-grid div{padding:15px;color:white;background:var(--ink)}.weather-grid strong,.weather-grid small{display:block}.weather-grid strong{color:var(--o);font:900 19px monospace}footer{padding:25px 0;color:var(--muted);font-size:10px}footer strong{color:var(--o);font-family:monospace}@media(max-width:650px){.report{padding:12px}.cover{min-height:260px;padding:26px}.cover h1{font-size:34px}nav{flex-wrap:wrap}nav input{width:100%;flex-basis:100%}dl,.weather-grid{grid-template-columns:1fr 1fr}.photos,.photo-index{grid-template-columns:1fr}.summary button{grid-template-columns:35px 1fr}.summary em{display:none}}@media print{body{background:white}nav{display:none}.report{width:auto;padding:0}.cover{break-after:page}.observation{box-shadow:none!important}}</style></head><body>${toolbar}<main class="report">${content}</main>${script}</body></html>`
}

function blobDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onerror = () => reject(reader.error); reader.onload = () => resolve(String(reader.result)); reader.readAsDataURL(blob) })
}

async function svgPng(svg: string) {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  try {
    const image = new Image()
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('The report map could not be rendered.')); image.src = url })
    const canvas = document.createElement('canvas'); canvas.width = 1650; canvas.height = 1080
    const context = canvas.getContext('2d'); if (!context) throw new Error('Image rendering is unavailable.')
    context.fillStyle = 'white'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height)
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('The map image could not be created.')), 'image/png'))
  } finally { URL.revokeObjectURL(url) }
}

export async function downloadComposedReport(project: Project, allRecords: FieldRecord[], format: 'html' | 'doc' | 'pdf', action: FileAction, options: ReportOptions, profile: UserProfile, weather: WeatherSnapshot | null) {
  const records = allRecords.filter((record) => options.recordIds.includes(record.id))
  if (!records.length) throw new Error('Select at least one observation for the report.')
  const slug = projectSlug(project)
  if (format === 'html') return downloadBlob(new Blob([buildInteractiveReportHtml(project, records, options, profile, weather)], { type: 'text/html;charset=utf-8' }), `${slug}-report.html`, action)
  if (format === 'doc') return downloadBlob(new Blob([buildInteractiveReportHtml(project, records, options, profile, weather, false)], { type: 'application/msword' }), `${slug}-report.doc`, action)
  const { jsPDF } = await import('jspdf')
  const document = new jsPDF({ unit: 'mm', format: 'a4' })
  const primary = hexRgb(options.primaryColor, [255, 121, 0])
  const secondary = hexRgb(options.secondaryColor, [17, 19, 24])
  const setPrimaryFill = () => document.setFillColor(primary[0], primary[1], primary[2])
  const setPrimaryText = () => document.setTextColor(primary[0], primary[1], primary[2])
  const setSecondaryFill = () => document.setFillColor(secondary[0], secondary[1], secondary[2])
  let hasContent = false
  const newSectionPage = () => { if (hasContent) document.addPage(); hasContent = true }
  const heading = (number: string, title: string, subtitle: string) => {
    setSecondaryFill(); document.rect(0, 0, 210, 25, 'F'); setPrimaryFill(); document.rect(0, 0, 5, 25, 'F')
    setPrimaryText(); document.setFontSize(9); document.text(number, 14, 10)
    document.setTextColor(255, 255, 255); document.setFontSize(16); document.text(title, 14, 18)
    document.setTextColor(95, 103, 112); document.setFontSize(8); document.text(subtitle, 14, 31)
  }
  const keyValueRows = (rows: Array<[string, unknown]>, startY: number) => {
    let y = startY
    for (const [key, value] of rows) {
      const text = document.splitTextToSize(String(value ?? ''), 115)
      const height = Math.max(9, text.length * 3.5 + 4)
      document.setFillColor(241, 243, 245); document.rect(14, y, 45, height, 'F'); document.setDrawColor(220, 224, 228); document.rect(14, y, 182, height)
      document.setTextColor(100, 107, 114); document.setFontSize(7); document.text(key.toUpperCase(), 17, y + 5.5)
      document.setTextColor(25, 27, 31); document.setFontSize(8.5); document.text(text, 64, y + 5.5)
      y += height
    }
    return y
  }
  for (const sectionId of options.sections) {
    if (sectionId === 'cover') {
      newSectionPage(); setSecondaryFill(); document.rect(0, 0, 210, 297, 'F'); setPrimaryFill(); document.rect(0, 0, 7, 297, 'F')
      setPrimaryText(); document.setFontSize(10); document.text(`FIELDNOTE // ${project.code}`, 20, 30)
      document.setTextColor(255, 255, 255); document.setFontSize(28); document.text(document.splitTextToSize(project.name, 165), 20, 65)
      document.setTextColor(190, 196, 202); document.setFontSize(12); document.text(project.client || 'Field project', 20, 96)
      document.setDrawColor(primary[0], primary[1], primary[2]); document.line(20, 112, 190, 112)
      document.setFontSize(9); document.text(`Field collection report`, 20, 128); document.text(`${records.length} selected observations`, 20, 136); document.text(`Generated ${new Date().toLocaleString()}`, 20, 144)
      if (options.includeAuthor) { setPrimaryText(); document.text(profile.name || 'Field operative', 20, 238); document.setTextColor(190, 196, 202); document.text(profile.company || 'Independent', 20, 246); if (profile.email) document.text(profile.email, 20, 254) }
    } else if (sectionId === 'map') {
      newSectionPage(); heading('01 // SPATIAL OVERVIEW', 'Project map', `${project.code} · ${records.length} mapped observations`)
      const png = await svgPng(await renderMudmapRasterSvg(project, records, reportMapOptions(options), weather)); document.addImage(await blobDataUrl(png), 'PNG', 14, 42, 182, 119)
      keyValueRows([['Project', project.name], ['Client / team', project.client], ['Coordinate reference', 'WGS 84 longitude / latitude'], ['Map status', 'Indicative field map — not a survey plan']], 174)
    } else if (sectionId === 'summary') {
      newSectionPage(); heading('02 // REGISTER', 'Observation summary', 'Status and field record register')
      let y = 43
      records.forEach((record, index) => {
        if (y > 278) { document.addPage(); heading('02 // REGISTER', 'Observation summary · continued', project.code); y = 43 }
        const statusColor = record.status === 'complete' ? [63, 132, 72] : record.status === 'needs-review' ? [224, 166, 29] : [196, 70, 56]
        document.setFillColor(statusColor[0], statusColor[1], statusColor[2]); document.rect(14, y, 4, 13, 'F'); document.setDrawColor(220, 224, 228); document.rect(18, y, 178, 13)
        setPrimaryText(); document.setFontSize(8); document.text(String(index + 1).padStart(2, '0'), 22, y + 8)
        document.setTextColor(20, 22, 25); document.setFontSize(9); document.text(record.label, 34, y + 6)
        document.setTextColor(100, 107, 114); document.setFontSize(7); document.text(`${record.category} · ${record.mode} · ${measurement(record)}`, 34, y + 10.5); document.text(record.status.toUpperCase(), 190, y + 8, { align: 'right' }); y += 15
      })
    } else if (sectionId === 'observations') {
      for (const [index, record] of records.entries()) {
        newSectionPage(); heading(`OBSERVATION ${String(index + 1).padStart(2, '0')} // ${record.mode.toUpperCase()}`, record.label, `${record.category} · ${record.status.toUpperCase()} · ${measurement(record)}`)
        const first = record.coordinates[0]
        const accuracies = record.coordinates.map((coordinate) => coordinate.accuracy).filter((value): value is number => typeof value === 'number')
        const rows: Array<[string, unknown]> = [['Status', record.status], ['Category', record.category], ['Geometry', `${record.mode} · ${record.coordinates.length} positions · ${measurement(record)}`], ['Operative', record.operative]]
        if (options.includeTimestamps) rows.push(['Collected', new Date(record.createdAt).toLocaleString()])
        if (options.includeCoordinates && first) rows.push(['Position', `${first.latitude.toFixed(7)}, ${first.longitude.toFixed(7)}`])
        if (options.includeAccuracy) rows.push(['GPS accuracy', accuracies.length ? `Worst recorded estimate ±${Math.max(...accuracies).toFixed(1)} m` : 'Not available'])
        if (options.includeAttributes) rows.push(...Object.entries(record.attributes ?? {}))
        let y = keyValueRows(rows, 42)
        if (options.includeComments) { y += 8; setPrimaryText(); document.setFontSize(8); document.text('COMMENTS / FIELD ASSESSMENT', 14, y); y += 5; const notes = document.splitTextToSize(record.notes || 'No comments recorded.', 176); document.setFillColor(255, 247, 237); document.rect(14, y, 182, Math.max(15, notes.length * 4 + 7), 'F'); document.setTextColor(35, 37, 40); document.setFontSize(9); document.text(notes, 19, y + 7); y += Math.max(15, notes.length * 4 + 7) }
        if (options.includePhotos && record.attachments.length) {
          y += 9; setPrimaryText(); document.setFontSize(8); document.text(`PHOTOGRAPHS (${record.attachments.length})`, 14, y); y += 5
          for (const [photoIndex, attachment] of record.attachments.entries()) {
            if (photoIndex % 2 === 1) continue
            if (y > 226) { document.addPage(); heading(`OBSERVATION ${String(index + 1).padStart(2, '0')} // EVIDENCE`, `${record.label} · photographs`, `${photoIndex + 1} of ${record.attachments.length}`); y = 42 }
            try { const imageType = attachment.dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG'; document.addImage(attachment.dataUrl, imageType, 14, y, 86, 58); document.setTextColor(70, 77, 84); document.setFontSize(7); document.text(document.splitTextToSize(attachment.caption || attachment.name, 82), 14, y + 62); if (photoIndex + 1 < record.attachments.length) { const next = record.attachments[photoIndex + 1]; const nextType = next.dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG'; document.addImage(next.dataUrl, nextType, 110, y, 86, 58); document.text(document.splitTextToSize(next.caption || next.name, 82), 110, y + 62) } y += 70 } catch { /* A corrupt image does not prevent the remainder of the report. */ }
          }
        }
      }
    } else if (sectionId === 'weather' && options.includeWeather && weather) {
      newSectionPage(); heading('SITE CONDITIONS', 'Field weather snapshot', `Open-Meteo · ${new Date(weather.capturedAt).toLocaleString()}`)
      keyValueRows([['Temperature', `${weather.temperature.toFixed(1)} °C`], ['Feels like', `${weather.apparentTemperature.toFixed(1)} °C`], ['Wind', `${weather.windSpeed.toFixed(0)} km/h at ${weather.windDirection.toFixed(0)}°`], ['Gusts', `${weather.windGusts.toFixed(0)} km/h`], ['Humidity', `${weather.relativeHumidity}%`], ['Precipitation', `${weather.precipitation.toFixed(1)} mm`], ['Cloud cover', `${weather.cloudCover}%`]], 44)
    } else if (sectionId === 'disclaimer') {
      newSectionPage(); heading('FIELD DATA NOTE', 'Limitations and use', project.code); document.setTextColor(40, 43, 47); document.setFontSize(10); document.text(document.splitTextToSize('Coordinates and measurements are indicative unless collected with a suitable calibrated survey instrument and verified workflow. Device accuracy values are estimates, not surveyed tolerances. Confirm critical positions and dimensions before design, construction or safety decisions.', 178), 14, 48)
    }
  }
  const totalPages = document.getNumberOfPages()
  for (let page = 1; page <= totalPages; page += 1) { document.setPage(page); document.setDrawColor(220, 224, 228); document.line(14, 287, 196, 287); document.setTextColor(110, 116, 122); document.setFontSize(7); document.text(`${project.code} · ${project.name}`, 14, 292); document.text(`FieldNote · ${page} / ${totalPages}`, 196, 292, { align: 'right' }) }
  return downloadBlob(document.output('blob'), `${slug}-report.pdf`, action)
}
