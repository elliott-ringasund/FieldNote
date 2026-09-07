import { Building2, Check, CloudSun, FolderTree, Moon, UserRound } from 'lucide-react'
import { useState } from 'react'
import type { Project, ThemePreference, UserProfile } from '../types'

type Props = {
  profile: UserProfile
  theme: ThemePreference
  weatherInOutputs: boolean
  project?: Project
  onSaveProfile: (profile: UserProfile, theme: ThemePreference, weatherInOutputs: boolean) => void | Promise<void>
  onSaveProject: (project: Project) => void | Promise<void>
}

export function SettingsView({ profile, theme, weatherInOutputs, project, onSaveProfile, onSaveProject }: Props) {
  const [draft, setDraft] = useState(profile)
  const [themeDraft, setThemeDraft] = useState(theme)
  const [weatherDraft, setWeatherDraft] = useState(weatherInOutputs)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [folderDraft, setFolderDraft] = useState(project?.folder ?? '')

  return <main className="page settings-page">
    <div className="page-title-row"><div><p className="eyebrow">Personal workspace</p><h1>Settings</h1><p>Open a section to change its settings.</p></div></div>
    <details className="settings-card settings-section"><summary className="settings-card-title"><UserRound /><div><h2>Your details</h2><p>Used automatically on new field records and reports.</p></div></summary><div className="settings-grid"><label className="field-label"><span>Name</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Field operative" /></label><label className="field-label"><span>Company</span><input value={draft.company} onChange={(event) => setDraft({ ...draft, company: event.target.value })} placeholder="Company or team" /></label><label className="field-label"><span>Email</span><input type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} placeholder="name@company.com" /></label></div></details>
    <details className="settings-card settings-section"><summary className="settings-card-title"><Moon /><div><h2>Appearance</h2><p>Follow your phone, or choose light or dark.</p></div></summary><div className="theme-options">{(['system', 'light', 'dark'] as ThemePreference[]).map((item) => <button type="button" className={themeDraft === item ? 'active' : ''} onClick={() => setThemeDraft(item)} key={item}>{item === 'system' ? 'Phone setting' : item === 'light' ? 'Light' : 'Dark'}{themeDraft === item && <Check size={16} />}</button>)}</div></details>
    <details className="settings-card settings-section"><summary className="settings-card-title"><CloudSun /><div><h2>Reports & exports</h2><p>Choose whether reports include weather.</p></div></summary><label className="toggle-row"><input type="checkbox" checked={weatherDraft} onChange={(event) => setWeatherDraft(event.target.checked)}/><span><strong>Include weather by default</strong><small>You can change this for each report.</small></span></label></details>
    <details className="settings-card settings-section"><summary className="settings-card-title"><Building2 /><div><h2>Active project</h2><p>{project ? `${project.code} · ${project.name}` : 'Choose a project to view its settings.'}</p></div></summary>{project && <><label className="field-label"><span><FolderTree size={14}/> Parent folder</span><input value={folderDraft} onChange={(event) => setFolderDraft(event.target.value)} placeholder="e.g. 2026 Inspections"/><small>Projects with the same folder name are grouped together.</small></label><p className="field-help">Coordinates use WGS 84 latitude / longitude. Choose the source coordinate system when importing data.</p></>}</details>
    {error && <p className="photo-error" role="alert">{error}</p>}
    <button className="primary-button settings-save" type="button" disabled={saving} onClick={async () => {
      setSaving(true); setError('')
      try {
        if (project && folderDraft.trim() !== (project.folder ?? '')) await onSaveProject({ ...project, folder: folderDraft.trim() || undefined, updatedAt: new Date().toISOString() })
        await onSaveProfile({ ...draft, name: draft.name.trim(), company: draft.company.trim(), email: draft.email.trim() }, themeDraft, weatherDraft)
      } catch { setError('Could not save all settings. Your changes are still here; try again.') }
      finally { setSaving(false) }
    }}><Check size={18} /> {saving ? 'Saving…' : 'Save settings'}</button>
  </main>
}
