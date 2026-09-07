import { ArrowRight, FolderOpen, FolderPlus, Search, Trash2, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { FieldRecord, Project } from '../types'

type Props = {
  projects: Project[]
  records: FieldRecord[]
  activeProjectId: string
  onOpen: (projectId: string) => void
  onCreate: (project: Project) => void
  onDelete: (project: Project) => void
}

export function ProjectsView({ projects, records, activeProjectId, onOpen, onCreate, onDelete }: Props) {
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [client, setClient] = useState('')
  const [folder, setFolder] = useState('')
  const [query, setQuery] = useState('')
  const [folderFilter, setFolderFilter] = useState('all')

  const folders = useMemo(() => [...new Set(projects.map((project) => project.folder?.trim()).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b)), [projects])
  const filteredProjects = useMemo(() => {
    const search = query.trim().toLocaleLowerCase()
    return projects.filter((project) => {
      const projectFolder = project.folder?.trim() || 'Unfiled'
      const matchesFolder = folderFilter === 'all' || folderFilter === projectFolder
      const matchesQuery = !search || [project.name, project.code, project.client, projectFolder].some((value) => value.toLocaleLowerCase().includes(search))
      return matchesFolder && matchesQuery
    })
  }, [folderFilter, projects, query])
  const groupedProjects = useMemo(() => {
    const groups = new Map<string, Project[]>()
    for (const project of filteredProjects) {
      const key = project.folder?.trim() || 'Unfiled'
      groups.set(key, [...(groups.get(key) ?? []), project])
    }
    return [...groups.entries()].sort(([left], [right]) => left === 'Unfiled' ? 1 : right === 'Unfiled' ? -1 : left.localeCompare(right))
  }, [filteredProjects])

  const submit = () => {
    if (!name.trim()) return
    const timestamp = new Date().toISOString()
    onCreate({ id: crypto.randomUUID(), name: name.trim(), code: code.trim() || `FIELD-${String(projects.length + 1).padStart(3, '0')}`, client: client.trim() || 'Internal project', folder: folder.trim() || undefined, description: 'Field collection project', status: 'active', color: '#31c4d6', coordinateSystem: 'EPSG:4326', createdAt: timestamp, updatedAt: timestamp })
    setCreating(false)
    setName('')
    setCode('')
    setClient('')
    setFolder('')
  }

  return (
    <main className="page projects-page">
      <div className="page-title-row">
        <div><p className="eyebrow">Field workspace</p><h1>Projects</h1><p>Everything collected in the field stays organised by job.</p></div>
        <button type="button" className="primary-button desktop-create" onClick={() => setCreating(true)}><FolderPlus size={19} /> New project</button>
      </div>

      <section className="project-browser" aria-label="Find and filter projects">
        <label className="project-search"><Search size={20}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search projects, codes, clients or folders"/><small>{filteredProjects.length} of {projects.length}</small></label>
        <label className="project-folder-filter"><FolderOpen size={19}/><select value={folderFilter} onChange={(event) => setFolderFilter(event.target.value)}><option value="all">All folders</option>{folders.map((item) => <option key={item} value={item}>{item}</option>)}<option value="Unfiled">Unfiled</option></select></label>
      </section>

      <section className="project-list">
        <div className="section-title"><h2>Project folders</h2><span>{folders.length + 1} locations</span></div>
        {!groupedProjects.length && <div className="project-empty"><Search/><strong>No matching projects</strong><small>Try another search or folder.</small></div>}
        {groupedProjects.map(([group, groupProjects]) => <section className="project-folder" key={group}><div className="project-folder-heading"><FolderOpen size={17}/><strong>{group}</strong><span>{groupProjects.length}</span></div>{groupProjects.map((project) => {
            const projectRecords = records.filter((record) => record.projectId === project.id)
            const latest = projectRecords[0]?.createdAt ?? project.updatedAt
            return <div className={`project-card ${project.id === activeProjectId ? 'selected' : ''}`} key={project.id}>
              <span className="project-accent" style={{ background: project.color }} />
              <button type="button" className="project-card-open" onClick={() => onOpen(project.id)}><span className="project-card-main"><span className="project-code">{project.code}</span><strong>{project.name}</strong><small>{project.client}</small></span><span className="project-meta"><strong>{projectRecords.length}</strong><small>records</small><span>{new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(new Date(latest))}</span></span><ArrowRight size={20} /></button>
              <button type="button" className="project-delete" onClick={() => onDelete(project)} aria-label={`Delete ${project.name}`}><Trash2 size={17} /></button>
            </div>
          })}</section>)}
      </section>

      <button type="button" className="floating-new-project" onClick={() => setCreating(true)} aria-label="Create project"><FolderPlus size={22} /></button>

      {creating && (
        <div className="sheet-backdrop solid" role="presentation">
          <section className="bottom-sheet compact-sheet" role="dialog" aria-modal="true" aria-labelledby="new-project-heading">
            <div className="sheet-handle" />
            <div className="sheet-heading"><div><p className="eyebrow">Set up a job</p><h2 id="new-project-heading">New project</h2></div><button type="button" className="icon-button" onClick={() => setCreating(false)} aria-label="Close"><X size={21} /></button></div>
            <div className="form-scroll">
              <label className="field-label"><span>Project name</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. North quay inspection" /></label>
              <label className="field-label"><span>Project code</span><input value={code} onChange={(event) => setCode(event.target.value)} placeholder="Generated if left blank" /></label>
              <label className="field-label"><span>Client or team</span><input value={client} onChange={(event) => setClient(event.target.value)} placeholder="e.g. Operations" /></label>
              <label className="field-label"><span>Parent folder</span><input list="project-folder-options" value={folder} onChange={(event) => setFolder(event.target.value)} placeholder="e.g. 2026 Inspections"/><datalist id="project-folder-options">{folders.map((item) => <option key={item} value={item}/>)}</datalist><small>Use an existing folder name or type a new one.</small></label>
              <label className="field-label disabled-setting"><span>Project coordinate system · coming later</span><select value="EPSG:4326" disabled><option>WGS 84 longitude / latitude</option></select><small>Project-level CRS selection is parked for now. Device data remains safely stored in WGS 84.</small></label>
            </div>
            <div className="sheet-actions"><button type="button" className="secondary-button" onClick={() => setCreating(false)}>Cancel</button><button type="button" className="primary-button" disabled={!name.trim()} onClick={submit}>Create project</button></div>
          </section>
        </div>
      )}
    </main>
  )
}
