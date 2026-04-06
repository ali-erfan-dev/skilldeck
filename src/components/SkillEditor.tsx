import { useState, useEffect } from 'react'
import { useConfigStore } from '../store/configStore'
import type { Skill } from '../types'

interface SkillEditorProps {
  skill: Skill
  onDelete: () => void
}

interface ParsedSkill {
  name: string
  description: string
  tags: string[]
  body: string
}

function parseSkillContent(content: string): ParsedSkill {
  let name = 'Untitled'
  let description = ''
  let tags: string[] = []
  let body = content

  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)?$/)
  if (fmMatch) {
    const fm = fmMatch[1]
    body = fmMatch[2] || ''

    const nameMatch = fm.match(/^name:\s*["']?(.+?)["']?\s*$/m)
    const descMatch = fm.match(/^description:\s*["']?(.+?)["']?\s*$/m)
    const tagsMatch = fm.match(/^tags:\s*\[(.+)\]\s*$/m)

    if (nameMatch) name = nameMatch[1]
    if (descMatch) description = descMatch[1]
    if (tagsMatch) tags = tagsMatch[1].split(',').map(t => t.trim().replace(/["']/g, ''))
  }

  return { name, description, tags, body }
}

function buildSkillContent(parsed: ParsedSkill): string {
  const tagsStr = parsed.tags.length > 0
    ? `\ntags: [${parsed.tags.map(t => `"${t}"`).join(', ')}]`
    : ''
  return `---\nname: "${parsed.name}"\ndescription: "${parsed.description}"${tagsStr}\n---\n${parsed.body}`
}

export default function SkillEditor({ skill, onDelete }: SkillEditorProps) {
  const { config } = useConfigStore()
  const [parsed, setParsed] = useState<ParsedSkill>(() => parseSkillContent(skill.content))
  const [saving, setSaving] = useState(false)
  const [showDeployModal, setShowDeployModal] = useState(false)
  const [deploying, setDeploying] = useState(false)
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [newTag, setNewTag] = useState('')

  useEffect(() => {
    setParsed(parseSkillContent(skill.content))
  }, [skill])

  const handleSave = async () => {
    setSaving(true)
    const content = buildSkillContent(parsed)
    await window.api.writeSkill(skill.filename, content)
    setSaving(false)
  }

  const handleDeploy = async () => {
    if (!selectedProjectId) return
    const project = config?.projects.find(p => p.id === selectedProjectId)
    if (!project) return

    setDeploying(true)
    try {
      // Ensure target directory exists
      const targetDir = `${project.path}/${project.skillsPath}`
      await window.api.ensureDir(targetDir)

      // Copy skill file to project
      const sourcePath = `${await window.api.getConfig().then(c => c.libraryPath)}/${skill.filename}`
      const targetPath = `${targetDir}/${skill.filename}`
      await window.api.copyFile(sourcePath, targetPath)

      // Get file hash for deployment record
      const hash = await window.api.fileHash(sourcePath)

      // Update deployments.json
      const deployments = await window.api.getDeployments()
      if (!deployments[project.id]) {
        deployments[project.id] = {}
      }
      deployments[project.id][skill.filename.replace('.md', '')] = {
        deployedAt: new Date().toISOString(),
        libraryHash: hash,
        currentHash: hash
      }
      await window.api.setDeployments(deployments)

      setShowDeployModal(false)
      setSelectedProjectId(null)
    } catch (err) {
      console.error('Deploy failed:', err)
    } finally {
      setDeploying(false)
    }
  }

  const updateField = (field: keyof ParsedSkill, value: string | string[]) => {
    setParsed(prev => ({ ...prev, [field]: value }))
  }

  const handleTagKeydown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && newTag.trim()) {
      const trimmedTag = newTag.trim()
      if (trimmedTag && !parsed.tags.includes(trimmedTag)) {
        updateField('tags', [...parsed.tags, trimmedTag])
      }
      setNewTag('')
      e.preventDefault()
    }
  }

  const removeTag = (tag: string) => {
    updateField('tags', parsed.tags.filter(t => t !== tag))
  }

  return (
    <div data-testid="skill-editor" className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-sm text-muted font-mono">{skill.filename}</span>
        <div className="flex items-center gap-2">
          <button
            data-testid="deploy-btn"
            onClick={() => setShowDeployModal(true)}
            disabled={!config?.projects.length}
            className="px-3 py-1.5 bg-border hover:bg-muted/30 disabled:opacity-50 text-fg text-sm rounded font-medium"
          >
            Deploy
          </button>
          <button
            data-testid="save-btn"
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1.5 bg-accent hover:bg-accent-dim disabled:opacity-50 text-bg text-sm rounded font-medium"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button
            data-testid="delete-btn"
            onClick={onDelete}
            className="px-3 py-1.5 text-red-400 hover:text-red-300 text-sm"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Metadata Fields */}
      <div className="px-4 py-3 border-b border-border space-y-3">
        <div>
          <label className="block text-xs text-muted mb-1">Name</label>
          <input
            type="text"
            value={parsed.name}
            onChange={e => updateField('name', e.target.value)}
            className="w-full bg-bg border border-border rounded px-3 py-1.5 text-sm text-fg focus:border-accent focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs text-muted mb-1">Description</label>
          <input
            type="text"
            value={parsed.description}
            onChange={e => updateField('description', e.target.value)}
            className="w-full bg-bg border border-border rounded px-3 py-1.5 text-sm text-fg focus:border-accent focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs text-muted mb-1">Tags</label>
          <div className="flex flex-wrap gap-1 mb-1">
            {parsed.tags.map(tag => (
              <span
                key={tag}
                className="px-2 py-0.5 bg-border rounded text-xs text-fg flex items-center gap-1"
              >
                {tag}
                <button
                  onClick={() => removeTag(tag)}
                  className="text-muted hover:text-fg"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <input
            data-testid="tag-input"
            type="text"
            value={newTag}
            onChange={e => setNewTag(e.target.value)}
            placeholder="Add tag and press Enter"
            onKeyDown={handleTagKeydown}
            className="w-full bg-bg border border-border rounded px-3 py-1.5 text-sm text-fg placeholder:text-muted focus:border-accent focus:outline-none"
          />
        </div>
      </div>

      {/* Body Editor */}
      <div className="flex-1 p-4 overflow-hidden">
        <textarea
          value={parsed.body}
          onChange={e => updateField('body', e.target.value)}
          className="w-full h-full bg-bg border border-border rounded p-3 text-sm text-fg font-mono resize-none focus:border-accent focus:outline-none"
          placeholder="Skill content in markdown..."
        />
      </div>

      {/* Deploy Modal */}
      {showDeployModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface border border-border rounded-lg p-4 w-80">
            <h3 className="font-medium text-fg mb-4">Deploy to Project</h3>
            <div className="space-y-2 mb-4">
              {config?.projects.map(project => (
                <button
                  key={project.id}
                  onClick={() => setSelectedProjectId(project.id)}
                  className={`w-full text-left px-3 py-2 rounded border ${
                    selectedProjectId === project.id
                      ? 'border-accent bg-accent/10'
                      : 'border-border hover:border-muted'
                  }`}
                >
                  <div className="font-medium text-fg">{project.name}</div>
                  <div className="text-xs text-muted font-mono">{project.path}</div>
                </button>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowDeployModal(false)
                  setSelectedProjectId(null)
                }}
                className="px-3 py-1.5 text-sm text-muted hover:text-fg"
              >
                Cancel
              </button>
              <button
                data-testid="confirm-deploy"
                onClick={handleDeploy}
                disabled={!selectedProjectId || deploying}
                className="px-3 py-1.5 text-sm bg-accent hover:bg-accent-dim disabled:opacity-50 text-bg rounded font-medium"
              >
                {deploying ? 'Deploying...' : 'Deploy'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}