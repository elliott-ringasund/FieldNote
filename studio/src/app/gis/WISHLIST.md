# Map — UI & feature wishlist

Running list of ideas to apply **after** the foundation is real (reachable page +
clean core + layer registry). Kept so nothing gets lost. Not a commitment to an
order — we'll batch the cosmetic ones into a polish pass.

Legend: 🎨 look/layout · ⚙️ behaviour/feature · 🧱 structural (decide early) · 🔎 needs investigation

## Architecture direction (current thinking — supersedes the 3-mode scaffold)
- **2 modes, not 3:** **View** (Operate + Explore merged) and **Create** (authoring).
  - Operate + Explore merge because "live" vs "history" is a **time filter, not a mode** — the historical
    data is just the **attributes of a layer's features** (add farm locations → each farm carries its
    reports / HTMLs / images / history). Click a feature to inspect; no mode switch.
  - Create stays separate: it's *editing* (draw / undo / save-as-deliverable), not viewing.
- **Layers = a data catalog you add from** (farm locations, ports, water spots, diesel spots, ships, …).
  Each layer's features **carry their data as attributes**. This folds the whole Atlas/data-warehouse idea
  into feature attributes instead of a separate mode.
- **Tools = things you do, orthogonal to layers:** measurement · notes · filtering · exports.
- **Notes is both:** creating a note is a **tool**; viewing notes is a **layer**. (General pattern: a tool
  writes data, a layer displays it.)
- ⏱ **Time is a filter, not a global toggle** (corrected — earlier "always-visible time control" was
  over-generalised from generic GIS). It applies mainly when *querying records* ("net-washing reports,
  May 2019") → a **filter tool** on feature attributes. The only genuinely-live thing is **vessel
  positions** (default = now); past positions are an optional **trails/playback** time-range on *that*
  layer. Static features (farms, ports, water/diesel) don't vary with time at all. No global map clock.
  → This makes the View merge *cleaner*, not costlier — the live-vs-historical tension mostly isn't real here.
- Impact: `modes.ts` drops to 2 modes; the mode scaffold's per-mode `layers` booleans give way to the
  **layer catalog + workspace** model and a **tools** system.

## View-mode UX (feedback round)
- ⚙️ **Feature interaction = two tiers:** **hover** → a small card with **name · owner · coordinates + a
  "View details" button**; clicking through opens the **full inspector** (feature attributes / data
  warehouse). Hover is the quick peek, details is the deep dive.
- 🧱 **Layer catalog = personal + public.** Our own layers *plus* **every relevant free public dataset**
  as an addable layer, tagged by provider: BarentsWatch (sites, AIS, lice/disease), Kartverket (charts,
  depth), MET (weather/waves), EMODnet (seabed — see Olex research). Catalog groups by source/provider.
- 🧱 **Layer panel = standard GIS:** each layer has a **visibility toggle** (show/hide) **+ remove +
  legend** (symbology shown so you know what marks mean). Likely also opacity + reorder later.
- ⚙️ **Tools = a toolbar** (not just a panel section). Current four (measure · notes · filter · export)
  **＋ route finder**. Flesh out the individual tools later.

## Layout / chrome
- ✅ **Basemap switcher bottom-left** — DONE. Google-Maps style, real-imagery thumbnails, expand-on-hover,
  click-to-switch. `core/BasemapSwitcher.tsx`. Removed the old picker from the sidepanel; scale moved
  bottom-right to make room.
- ✅ **Search bar top-middle** — DONE. Composable `core/MapSearch.tsx`, results dropdown + fly-to,
  replaced the old top-left search.
- ✅ **Live cursor lat/long readout** — DONE. Bottom-centre, updates on move, click-to-copy as `lat, lng`
  (Google-Maps paste order). `core/CoordinateReadout.tsx` — composable chrome, on every map.
- ⚙️ **Settings bar / panel** — user preferences (see symbology below).
- 🧱 **Workspace + "add layer" button** — beyond the mode's base layers, each user has a **workspace**:
  their own set of optional layers added on top. The add-layer button opens a **layer catalog**; the user
  adds layers (e.g. **Notes**) to their workspace. Model: **Mode = curated base · Workspace = user's added
  layers**. "Add layer" and "notes" are the same mechanism.

## Panels & windows (feedback round 2)
- 🟡 **Moveable panels** — DONE (moving). Layers panel + toolbar are **draggable** by a grip (⠿), via a
  lightweight custom `core/useDraggable.ts` (mouse events, clamped to parent) — no library dependency.
  Still TODO: **joining/docking** (snap panels together into tabbed groups) — that's the bigger step and
  would use a library (dockview / rc-dock / flexlayout-react); a dependency decision for Elliott.
- ✅ **"Add layer" → a search window** — DONE. `core/LayerBrowser.tsx` modal: searches label / provider /
  components, grouped by source. **Component-level adds DONE** — components are toggle chips (default all),
  Add brings only the selected ones; the workspace shows the chosen subset. Prominent full-width **"＋ Add
  layers"** button. Replaced the inline dropdown.
- ✅ **Per-layer export** — DONE. Each workspace row has a ⭳ that downloads that layer's data as GeoJSON
  (`exportLayer` in the harness; ready layers export real features, stubs export empty). TODO: wire into
  the Export tool + richer formats (CSV, print).
- ✅ **Basemap thumbnails over land** — DONE. Reframed on Bergen (z10) so terrain / streets / chart /
  harbour read clearly instead of open sea. `getBasemapThumbnail` in `basemaps.ts`.

## Basemaps
- 🔎 **Olex-style / bathymetry basemap** — RESEARCHED (see findings below). Olex itself = not possible
  (proprietary, crowd-sourced DB shared only by email; no API/tiles). Closest keyless options, both
  verified live with `Access-Control-Allow-Origin: *`:
  - **EMODnet mean-depth** — full-coverage coloured seabed, XYZ-tiled, best "bathymetry basemap".
    `https://tiles.emodnet-bathymetry.eu/latest/mean_multicolour/web_mercator/{z}/{x}/{y}.png`
    (~115 m resolution; loud rainbow palette; also `mean_atlas_land`, `mean_rainbowcolour`).
  - **Kartverket dybdedata (WMS)** — chart-style depth tint + contours + soundings, scale-dependent
    (detail overlay, empty at overview). `https://wms.geonorge.no/skwms1/wms.dybdedata2` layers
    `Dybdedata2` / `Dybdelag` / `Dybdekontur`. Olex-level detail (<25 m grid) is CLASSIFIED in Norway.
  - ⚠️ Build TODO: add hosts to production CSP `img-src` (`docs/csp.md`), add EMODnet + Kartverket
    attribution. Neither reaches Olex's fjord-floor detail — that would need our own echosounder data
    imported to PostGIS (ties to the Atlas / deliverables track).

## Layers & symbology
- 🟡 **Nicer symbols** — vessels DONE: AIS-style directional markers (coloured dot + white heading
  arrow, rotates by `headingDegrees`). `renderVessels` in `gisLayers.ts` + `VESSEL_ICON`.
  Still TODO: sites (differentiate shape, e.g. diamond) and making symbology a **user preference**
  → ties to the settings panel below.
- 🧱 The "add layer" + per-user symbology implies the **layer registry must be dynamic and
  style-configurable**, not a hard-coded list. Keep the layer-module interface open to this.

## Notes / annotations (crew-contributed) — NEW, build later
- ⚙️ Let crews on a boat drop **notes on the map** in the field. Real cases:
  - **Label ring numbers** — a farm's ring/cage numbers aren't known until you see the sign on the
    ring; let the crew tag each ring on the spot.
  - **"No fish here"** and similar operational status worth sharing with the next crew.
- 🧱 Placement: **NOT its own mode** — a cross-cutting **Notes layer + quick "add note" action available
  in every mode** (esp. Operate, since the trigger is "I'm on the boat and I notice something"). Toggle
  the layer to show/hide notes.
- 🧱 Notes are **shared, persistent spatial data** ("handy for people to know") → the first genuinely
  user-*written* spatial records (vs read-only feeds). Needs a backend store (PostGIS / data track):
  geometry + text + author + timestamp + optional category (ring#, no-fish, hazard) + link to site/asset.
- ⚙️ **Publish / draft model**: a note is a **private draft** (only you see it) until you hit **Publish**;
  published notes go shared, with **author + timestamp** visible. (This answers the earlier ephemeral-vs-
  authoritative question: draft = yours, published = everyone's.)
- 🧱 **Notes is an addable layer**: users see notes by **adding the Notes layer to their workspace** (via
  the add-layer button) → notes and "add layer" are the same mechanism, not separate features.
  - ⚠️ Check existing `api/maps.ts` **MapPlace** API (listMapPlaces/create + suggestion/confirmation
    flow) — may already be a foundation or adjacent.
- ⚙️ Full **CRUD + styling**: create, **edit**, **delete**, and change each note's **colour and symbol**.
  → shares the symbol/colour picker with the layer symbology system (see Layers & symbology) — build the
  picker once, use it for both note styling and per-user layer symbols.
- Ring-labeling has two levels: (a) quick freeform pin at a ring; (b) structured cage/ring labels tied to
  the site's **cage layout** — connects to `LocationBuilderPage`, which already models cages/rings.
- Design Qs for later: who can edit / who sees whose notes; ephemeral vs authoritative; **offline capture**
  (boats lose signal → note queues, syncs later — ties to offline-at-sea).

## THE NORTH STAR (Elliott, feedback round 4)
> "We want to mimic **QGIS and Autodesk** when it comes to digitizing and drafting — almost making a
> simple hybrid." … "The goal would be to **upload the data and then most of everything is done**, with tweaks."

Everything below serves that. Two reference models, deliberately blended:
- **QGIS** — a layers tree, groups, per-layer symbology, label rules driven by attributes, attribute table.
- **AutoCAD** — drafting precision, text as placeable objects, and **model space vs paper space**
  (the map you draft in vs the sheet you issue).

### 1. Layers tree (QGIS panel) — groups live *with* the features
- 🧱 Groups must sit **inside the Survey section alongside the lines and points**, not in a separate tab.
  One tree: group → its features. Create a group via a **button *or* right-click → New group** (QGIS).
- Geometry types are part of the tree's vocabulary: **point · line · polygon · rectangle · circle · text**.

### 2. Labels — QGIS rules + CAD text objects (hybrid)
- **QGIS half:** labels are a *layer/group property* — pick which attribute to show, size, placement;
  auto-placed for every feature in the group. (Group already has labels on/off + size — extend it to
  "label from attribute" + placement.)
- **CAD half:** a **Text geometry type** — free annotations you place and drag anywhere, independent of
  any feature. Treat text as its own layer type in the tree.
- Both are needed; neither alone is enough.

### 3. Images — RECOMMENDATION (Elliott asked which way to go)
His instincts, both right: *"images are generally associated with the line"* and *"maybe a separate
geometry for images (camera symbol)"* and *"at the end of the day images are associated with spots on the
line so maybe it's just an attribute"*. Resolve it as **one model, two views**:
- An image is an **attribute of a feature** (usually the line it documents) — matches how the work is
  organised, and how the Koløy deliverable reads.
- It *optionally* carries its **own position** (lat/lng + depth + chainage along the line). When it has
  one, it renders as a **camera symbol** on the map in a toggleable sub-layer.
- Position is resolved in this order, falling back as needed:
  1. ~~**EXIF GPS**~~ — ❌ RULED OUT: the 47 real Koløy ROV frames carry **no EXIF at all**.
  2. ✅ **Burned-in overlay OCR** — CONFIRMED the way. The ROV HUD is a **fixed layout**: site + line
     name bottom-left ("Koløy L13"), position in DDM bottom-centre, date/time bottom-right, depth on
     the right-hand DPT scale, heading top-centre. Regions must be **fractional** — frame sizes vary
     (1258–1400 px wide). Feasibility proven with easyocr on the real frames; `overlayParse.ts` +
     tests are built against that verbatim output.
     - Systematic OCR flaw: the **degree glyph reads as a trailing digit** (`59°`→598/599/590,
       `5°`→59/50/58) while **minutes come through clean**. Handled by reconciling degrees against the
       survey's own centre rather than trusting the read.
     - Known limit: OCR sometimes drops a digit from the line token ("L;3" for L13). Mitigate by
       snapping to the nearest *existing* line name in the survey.
     - Some frames genuinely have no coordinates (blank strip) → must degrade gracefully.
     - ⚠️ Needs a browser OCR engine — **tesseract.js is a dependency decision for Elliott**.
  3. ~~**Timestamp ↔ nav-log match**~~ — ❌ no position log exists; the CSVs are winch/holding-force
     logs (time + tonnage), not navigation.
  4. **Manual** — click the spot on the line, always available for correction.
- ⚠️ Manual intervention must always be possible; auto-placement is a head start, not a lock-in.

### 3a. THE REAL DELIVERABLE — "60mnd kontroll Toska S.pdf" (113 pages)
Elliott's actual in-progress report. This is the template to hit. Note the job is **Toska S**
(Lingalaks, loknr 14018, Alver) — the *same* 35 lines already imported from the spreadsheet.

Structure, page by page:
1. **Cover** — "4 års kontroll / Toska S / Inspeksjon av fortøyningsliner ved oppdrettslokalitet /
   Utført av: Ringasund AS". Running header on every page: `Ringasund AS  Toska S  18.06.26`.
2. **Føringer** — the *client's* scope/criteria (Lingalaks' requirements for the ROV inspection:
   innfesting, sjakler/kauser, stramheit, avstand til kablar, bunnkjetting ≥2 m frå botn, bolt…).
   → a report block whose text comes from the **client**, reusable per client.
3. **ROV-rapport summary table** — the job's title block, richer than ours:
   Dato · Rapportnr · Dato forrige inspeksjon · Driftsleder båt · Lokalitet · Båt · Utførende selskap ·
   **Programvare** (Olex/Options/Kongsberg) · Operatører · Lagret fil · Overlevert film til ·
   **Antall avvik** · **Antall attention** · **Antall liner** · **Total meters driven** ·
   Vurdering OK / Ikkje OK · Report written by · a GPS-accuracy caveat
   ("GPS positions can deviate 5-15 meters").
   → most of these are countable from the survey; the rest are title-block fields we lack.
4. **Line schedule** — exactly the imported spreadsheet (already reproduced).
5. **Per-line observation tables** — `Type | Linenr | Enhet | Dybde (m) | Observasjonar`, e.g.
   L1 · Flexilink · 12 m · "Line begynner i flexilink; orientert riktig";
   L1 · Overgang til kjetting · 92 m · "4 trålkuler festet på line; bunn synlig under kause…";
   L1 · Anker · 98 m · "Anker går ned i mud…".
6. **Photo pages** — the bulk of the 113 pages.

🧱 **This resolves the image question.** A line is inspected at a series of **stations down its
length**, each with a component type (Enhet: Flexilink / Overgang til kjetting / Anker), a **depth**,
bullet observations, and photos. So the model is:
`line → stations[] (enhet, depth, observations[], photos[])`
— which is both "images belong to the line" *and* "images are at spots along the line". The depth IS
the position along the line. Build `SurveyStation` as a child of a path.

### 3b. Multi-select + bulk edit (NEXT)
- ⚙️ **Select several features** (ctrl/shift-click in the tree, shift-drag a box on the map), get them
  **highlighted**, then **change properties for the whole selection at once**: symbol, line width, area
  fill/size, status, group. QGIS's select-then-edit, and the natural partner to the attribute table
  (select rows there too, and the map selection should mirror it).

### 4. Attributes table
- 🧱 A proper **attribute table** view (QGIS): all features of a group in a grid, sortable, editable,
  select-a-row → highlights on the map (and vice versa). The importer already produces the attributes;
  this is the way to see and fix them in bulk.

### 5. Notes & comments in the deliverables
- Comments/notes must flow into the **HTML map** and the **report**, the way the Koløy HTML does.
  (Feature notes already do; group observations already do — extend to free notes/annotations.)

### 6. Report modules editable
- Every report block must be **editable in place**, not just toggleable. Text blocks are editable now;
  extend to reordering, adding custom blocks, and editing the generated sections.

### 7. Tabs → scenes / windows (model space vs paper space) — ✅ BUILT
- `create/PreviewPane.tsx` docks the **live deliverable** beside the map: draft on the map (model space)
  while the report or HTML map renders in a resizable right-hand pane (paper space), AutoCAD-style.
- Rebuilds from the same survey on a 450 ms debounce (a "live / updating…" indicator shows which);
  switch between 📄 Report and 🗺 Map in the pane; print or download straight from its header.
- `MapCanvas` gained `rightInset` + a ResizeObserver so MapLibre refits when the pane opens or is dragged.
- Report sheet is **A4 portrait by default**, with a portrait/landscape toggle for wide line schedules.
- Still to do: more than two panes / free docking, and floating (undocked) windows.

## Create mode (authoring deliverables) — the vision
The model: **one dataset → many deliverable "tabs".** You're in Create with your map + chosen layers,
you author the survey data (real inputs — draw points/lines, attach photos, enter values), and each **tab
is a different output format** of that same data:
- **Map (HTML)** — the interactive Koløy-style map. Data-driven (real inputs, not fudged).
- **Report (PDF / paper)** — a **template**, **modular**: import blocks (disclaimer, introduction, image,
  the map, tables). Goal = **consistency at a professional level**. Can be simple.
- **Data (CSV)** — export the raw survey data.
- (extensible — more formats over time; different jobs want different outputs)

Principle: **author once, render many.** GIS/HTML outputs must be real-data-driven; the report is a
modular template for professional consistency. Create draws **fresh on the map**, borrowing
LocationBuilder's photo/documentation model (not absorbing its schematic editor).

### Built (full pipeline working end-to-end, verified in harness)
The whole author→deliverable loop is live in `src/app/gis/create/`:
- **`deliverable.ts`** — the model. Borrowed thinking: **CAD title blocks** (title/ref/site/vessel/author/
  date/rev on every deliverable = consistency), **Survey123** (a point = location + category + status +
  note), **QGIS print layouts** (report = standard blocks).
- **Survey tab** — title-block form; draw points (crosshair, click map); per-point **name, category**
  (observation/checkpoint/anchor/buoy/shackle/hazard), **status** (OK/attention/fail → marker colour),
  **note**. Selected point gets a properties form.
- **Map · HTML tab** (`htmlMapExport.ts`) — generates the **Koløy-style standalone deliverable**: same
  architecture as the hand-made ones (single file, Leaflet CDN, Esri imagery + Kartverket sjøkart
  switcher), title header from the title block, status-coloured markers with labels + popup notes,
  legend, scale. Preview + Download .html. VERIFIED rendering with real authored data.
- **Report tab** (`reportExport.ts`) — print-ready A4 via browser print→PDF. **CAD-style title block**,
  summary pills (n OK / n Attention / n Fail), **modular blocks** (cover, disclaimer, introduction,
  findings table with status dots, sign-off) — toggleable, editable default texts. VERIFIED.
- **Data tab** — table + CSV (now incl. category/status/note).

### Round 2 — BUILT (Elliott's feedback round: lines/COGO/photos/report depth)
- ✅ **Lines & areas** — draw by clicking, by **typed start coordinate** ("59.79, 5.05" — same format the
  coordinate readout copies), and by **bearing° + length m legs (COGO)**. `geo.ts` = spherical geodesy
  (destination/bearing/distance — verified numerically). Segment labels on map + exports: "045° · 500 m".
- ✅ **Editing / manual fix-ups** — select a path → **drag vertices on the map**, or edit lat/lng
  numerically, or delete vertices. Verified (strays deleted, geometry preserved).
- ✅ **Photos on any feature** — file input → data URLs on points *and* lines/areas; thumbnails with
  remove in properties; embedded in the HTML popups and the report's **photo appendix** (captioned
  Figure n — name: note), Koløy-style.
- ✅ **Report deepened** — new blocks: **Methodology** (editable default), **Line schedule** (start ·
  initial bearing · length · status · notes — how mooring layouts are actually specified), **Photo
  appendix**. Verified.
- ✅ **HTML map deepened** — polylines/polygons with status colours, segment bearing·length labels,
  popups with total length + notes + photos. Data CSV split: points.csv + lines.csv.

### Real-data round — BUILT (for the first real job)
- ✅ **Autosave** — the survey (title block, points, paths, photos) persists to localStorage on every
  change; restored on reload. "✓ saved" indicator + ⚠ warning if quota exceeded (photos are data URLs).
  🗑 New button (two-click confirm) starts a fresh survey. Verified across a full reload.
- ✅ **Official aquaculture register, live** — Fiskeridirektoratet's open ArcGIS server via a Vite dev
  proxy (`/fdir` → gis.fiskeridir.no; server sends no CORS so the proxy is required — production needs
  the same reverse-proxy rule). Two layers in the catalog, both verified rendering:
  - **Aquaculture register (all sites)** — layer 0 `akvakultur_lokaliteter`, green rings + navn (loknr).
  - **NYTEK moorings** — layer 93 `NYTEK_forankringsliner`, the certified mooring lines, violet.
  - More available on the same server for later: NYTEK_forankring (anchor pts), Flate/Ytterpunkt
    (cage areas per register), PD_og_ILA zones, Biomasse, B/C-undersøkelser.
- ✅ **Go-to-coordinate** — paste "59.79, 5.05" into the search bar → "→ Go to …" flies there.
- ✅ **Client site layers** (`clients.ts`) — each client operator is its own layer, filtered live from the
  register by licence holder (`til_innehavere`, case-insensitive *contains* — sites are often jointly
  held, e.g. "EIDESVIK LAKS AS, LINGALAKS AS, TOMBRE FISKEANLEGG AS"). Own colour + labels + a **Clients**
  catalog group. Live today: **Lingalaks (18 active sites)**, Hardingsmolt (2), Eidesvik Laks (10),
  Tombre (23). Add a client = one entry in `CLIENT_OPERATORS`.
- ✅ **Register popups** — click any register/client site → name, lok.nr, kommune, **holder**, capacity,
  species, status, and a link to Akvakulturregisteret.
- 🐛 **FIXED: all map labels were silently broken.** `basemaps.ts` pointed `glyphs` at
  `basemaps.cartocdn.com/gl/positron-gl-style/...` which now **404s**; MapLibre needs the glyph PBF before
  it can draw *any* text, so every label (ours and the basemap's) vanished. Correct host is
  `https://tiles.basemaps.cartocdn.com/fonts/{fontstack}/{range}.pbf` (CORS `*`). ⚠️ Production CSP must
  allow that host. Consider self-hosting the glyph PBFs to remove the runtime dependency entirely.

### Real inspection-sheet round — BUILT
Driven by a real Lingalaks mooring inspection sheet (35 lines × 19 columns). What it changed:
- ✅ **Lines are start→end, not bearing+length.** Real sheets record both ends; bearing/length are
  *derived* (still shown on map, labels and schedule). COGO entry stays for the cases that need it.
- ✅ **DDM coordinates** (`geo.ts`) — degrees + decimal minutes, the marine standard the sheets and
  plotters use (60° 37.757′ N). Parsed on input, displayed in properties/preview/report.
- ✅ **Paste-from-spreadsheet importer** (`tableImport.ts` + `ImportDialog.tsx`) — the headline feature.
  Copy rows from Excel → paste → columns are **auto-mapped** from the header (incl. recognising the
  *first* N°/N′/E°/E′ block as start and the *second* as end) → preview → import. Roles are editable, so
  it works with any client's sheet layout. Status maps Ok / **Avvik** / Attention.
- ✅ **Feature attributes** (`attrs`) — every non-position column is kept as a named attribute (HDN,
  anchor/bolt/chain, line tightness, bottom sediment, meters driven, depth, actual line length, chain
  distance) and flows to: properties panel, **HTML popups** (attribute table), **report line schedule**
  (dynamic columns, auto **A4 landscape** when wide), and **CSV** (round-trips).
- ✅ **Search finds real sites** (`useSiteSearch.ts`) — live, debounced query against the register by
  name or lok.nr, whether or not a layer is loaded. Coordinate paste still offers "Go to".
- ✅ **Workspace grouped under subheadings** (Clients first) with each layer's colour on its symbol.

### File import + user layer groups — BUILT
- ✅ **Import the file, not just paste** (`spreadsheetFile.ts`) — drop or pick **.xlsx / .csv / .tsv**.
  The .xlsx reader is a small ZIP + XML parser (browser `DecompressionStream` + `DOMParser`), so no
  spreadsheet library is pulled into the bundle. Falls back with clear guidance if a file can't be read.
- ✅ **Data viewer** — a scrollable, sticky-header grid of the parsed rows inside the import dialog, so
  you can see exactly what was read before committing to it.
- ✅ **Two-row merged headers handled** (`normaliseGrid`) — real sheets put a banner row
  ("Start line of position on Flåte") above the column names; header rows are detected by *not* looking
  numeric and collapsed by taking the lowest non-empty label per column. Shared by the paste and file paths.
- 🐛 Fixed: `"Actual line length (does **no**t allow…)"` was stealing the *name* role (matched "line" +
  "no"). Roles like name/status/note are now single-slot, first-match-wins, and word-bounded.
- 🐛 Fixed: empty cells parsed as `0` (`Number("") === 0`), which planted features at 0°N 0°E instead of
  skipping the row — a footnote row became a phantom line.
- ✅ **User layer groups** (`useWorkspace.ts` + `LayerPanel.tsx`) — make your own group ("Lines"),
  **drag layers into it**, rename (double-click), collapse, **hide the whole group**, or dissolve it
  (layers return to their catalog sections). Catalog groups remain as the fallback sections beneath.
  Panel extracted out of the harness so the real GisMapPage can reuse it.

### Feature groups (symbology) — BUILT
The ask: 35 imported lines in a flat list is a mess; lines from the flåte vs from the buoys need to be
separable, and one set emphasised while the other fades back.

- ✅ **Feature groups own the symbology** (`SurveyGroup` in `useSurvey.ts`, `GroupsPanel.tsx`) — colour,
  **opacity**, width, visibility, labels on/off, label size. Features inherit from their group, so
  "make the flåte lines red and fade the buoy lines" is two clicks, not thirty edits.
- ✅ **`colorMode`**: `fixed` (group colour, for emphasis) or `status` (OK/Attention/Fail). Both matter —
  emphasis for the narrative, status for the inspection meaning — so the group chooses.
- ✅ Assign by **drag** or the per-feature dropdown; groups rename (double-click), collapse, delete
  (features survive, fall back to Ungrouped). Imports land in their own **named group** (set in the
  import dialog).
- ✅ **Accent recoloured** to the Fleo brand blue (`#36a2ef` / `#2b87c9` / `#8fd3ff` from
  `packages/design-tokens`), replacing the teal chrome. Status colours deliberately untouched.

**Studied RoofTools (Fulcrum Roof) for this** — two patterns worth keeping:
1. **Style by semantic class, not per feature** (`DefectStrokeColor`, `BuildingOutlineColor`), and every
   screen style has a **`Report*` twin** so print can be styled differently from screen. Our group
   symbology is the same idea; the Report* split is still TODO and worth copying.
2. **Labels styled per class in settings** (`EntityLabelFontSize/TextColor/BackgroundColor/Border/
   Padding/Shadow`), auto-placed by a `GeometryLabelPositioner` — not hand-dragged. We follow this:
   label on/off + size live on the group.
3. Its grouping is a **shared Category hierarchy JSON** (`HierarchyEditorWindow`, `TryCopyHierarchyFrom
   Remote`) — a controlled vocabulary shared across the team rather than ad-hoc groups. Strong idea for
   consistency when others are taught the workflow → candidate for a shared group/category preset.

### Still missing (asked for, not yet built)
- **Symbols** — only colour/width/opacity/labels so far; no point-symbol shapes (circle/square/triangle/
  icon) or line styles (dashed/dotted).
- **Draggable labels** — labels are auto-positioned; size/on-off are per group. Manual offset per feature
  and a text/annotation layer (CAD-style) are not built.
- **Circle / rectangle** draw tools — only point, line, area (polygon).
- **Report\* style twins** — print currently reuses screen styling.

### Next for Create
- Checkpoint **on a line** (chainage — "at 140 m along Line 3"); auto-attach nearest line.
- Report: **map snapshot block** (static image of the survey in the PDF).
- **Save/load deliverables** (persist → becomes Atlas data); **templates per job type** (mooring
  inspection / net wash presets: categories + blocks preconfigured).
- Undo for draw/edit actions; snapping (vertex-to-point).
- Popup-blocker friendliness: preview opens via window.open — fine in real browsers, blocked in some
  embedded panes.

## Structural constraints (decide as we build, not later)
- 🧱 **Must fit within Fleo's boundary / design system.** The map can't be a standalone island — it
  needs Fleo's shell, nav, and design tokens around it. Affects the chrome layer and whether the page
  is truly fullscreen or framed. Revisit when wiring the app shell (Step 3).
- 🧱 **Chrome is its own layer** — search, basemap control, coordinate readout, settings, panels are
  composable UI *around* the core, shared across the three apps (Passage / Atlas / Fieldwork), not
  baked into any one page.
