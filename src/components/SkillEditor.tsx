import { useState, useEffect } from 'react'
import { getProfileById } from '../types'
import { useConfigStore } from '../store/configStore'
import { useSkillStore } from '../store/skillStore'
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

interface ToolTarget {
  id: string
  name: string
  path: string
}

function parseSkillContent(content: string): ParsedSkill {
  let name = 'Untitled'
  let description = ''
  let tags: string[] = []
  let body = content

  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)?$/)
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
  const { loadAllSkills } = useSkillStore()
  const [parsed, setParsed] = useState<ParsedSkill>(() => parseSkillContent(skill.content))
  const [saving, setSaving] = useState(false)
  const [showDeployModal, setShowDeployModal] = useState(false)
  const [deploying, setDeploying] = useState(false)
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [selectedTools, setSelectedTools] = useState<string[]>([])
  const [toolTargets, setToolTargets] = useState<ToolTarget[]>([])
  const [deployPreview, setDeployPreview] = useState<{
    needsPreview: boolean
    targetPath: string
    fileExists: boolean
    existingContent: string
    mergedContent: string
    hasConflict: boolean
    sectionAlreadyExists: boolean
    skillName: string
    format: string
  } | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [newTag, setNewTag] = useState('')
  const [showHistory, setShowHistory] = useState(false)
  const [versions, setVersions] = useState<{ id: string; timestamp: string; hash: string }[]>([])
  const [selectedVersion, setSelectedVersion] = useState<{ id: string; timestamp: string; hash: string; content: string } | null>(null)

  // Detect available tools when modal opens
  useEffect(() => {
    if (showDeployModal && window.api.detectTools) {
      window.api.detectTools().then(tools => {
        setToolTargets(tools)
      }).catch(err => {
        console.error('Failed to detect tools:', err)
        setToolTargets([])
      })
    }
  }, [showDeployModal])

  useEffect(() => {
    setParsed(parseSkillContent(skill.content))
    setNewTag('') // Reset tag input when switching skills
  }, [skill])

  const handleSave = async () => {
    setSaving(true)
    const content = buildSkillContent(parsed)
    await window.api.writeSkill(skill.filename, content)
    // Save version snapshot
    const skillName = skill.filename.replace('.md', '')
    if (window.api.saveVersion) {
      await window.api.saveVersion(skillName, content)
    }
    // Reload skills to update sidebar
    await loadAllSkills()
    setSaving(false)
  }

  const handleDeploy = async () => {
    if (!selectedProjectId && selectedTools.length === 0) return

    setDeploying(true)
    try {
      const skillName = skill.filename.replace('.md', '')
      // Use current edited content for sync
      const content = buildSkillContent(parsed)

      // Deploy to project if selected — use target profile
      if (selectedProjectId) {
        const project = config?.projects.find(p => p.id === selectedProjectId)
        if (project) {
          const profileId = project.targetProfile || 'claude-code'
          const profile = getProfileById(profileId)

          // Use profile-aware deployment if available
          if (profile && window.api.deployProfile) {
            await window.api.deployProfile(project.id, skillName, content, profileId)

            const sourcePath = skill.source === 'skilldeck'
              ? `${config!.libraryPath}/${skill.filename}`
              : skill.sourcePath
            const hash = await window.api.fileHash(sourcePath)

            const deployments = await window.api.getDeployments()
            if (!deployments[project.id]) {
              deployments[project.id] = {}
            }
            deployments[project.id][skillName] = {
              deployedAt: new Date().toISOString(),
              libraryHash: hash,
              currentHash: hash,
              profileId
            }
            await window.api.setDeployments(deployments)
          } else {
            // Fallback to legacy deployment (copy file)
            const targetDir = `${project.path}/${project.skillsPath}`
            await window.api.ensureDir(targetDir)

            let sourcePath: string
            if (skill.source === 'skilldeck') {
              sourcePath = `${config!.libraryPath}/${skill.filename}`
            } else {
              sourcePath = skill.sourcePath
            }

            const targetPath = `${targetDir}/${skill.filename}`
            await window.api.copyFile(sourcePath, targetPath)

            const hash = await window.api.fileHash(sourcePath)
            const deployments = await window.api.getDeployments()
            if (!deployments[project.id]) {
              deployments[project.id] = {}
            }
            deployments[project.id][skillName] = {
              deployedAt: new Date().toISOString(),
              libraryHash: hash,
              currentHash: hash
            }
            await window.api.setDeployments(deployments)
          }
        }
      }

      // Sync to tool directories if selected
      if (selectedTools.length > 0 && window.api.syncToTools) {
        await window.api.syncToTools(skillName, content, selectedTools)
      }

      setShowDeployModal(false)
      setSelectedProjectId(null)
      setSelectedTools([])
      setDeployPreview(null)
      setShowPreview(false) } catch (err) {
      console.error('Deploy failed:', err)
    } finally {
      setDeploying(false)
    }
  }

  const toggleTool = (toolId: string) => {
    setSelectedTools(prev =>
      prev.includes(toolId)
        ? prev.filter(t => t !== toolId)
        : [...prev, toolId]
    )
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
      <div className="flex flex-col px-4 py-3 border-b border-border">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm text-muted font-mono">{skill.filename}</span>
          <div className="flex items-center gap-2">
            <button
              data-testid="deploy-btn"
              onClick={() => setShowDeployModal(true)}
              className="px-3 py-1.5 bg-border hover:bg-muted/30 text-fg text-sm rounded font-medium"
            >
              Deploy
            </button>
            <button
              data-testid="history-btn"
              onClick={async () => {
                const skillName = skill.filename.replace('.md', '')
                if (window.api.listVersions) {
                  const v = await window.api.listVersions(skillName)
                  setVersions(v)
                }
                setShowHistory(!showHistory)
                setSelectedVersion(null)
              }}
              className="px-3 py-1.5 bg-border hover:bg-muted/30 text-fg text-sm rounded font-medium"
            >
              History
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
        <div className="text-xs text-muted/50 font-mono truncate">
          {skill.sourcePath || `${skill.source === 'skilldeck' ? 'Library' : skill.source}: ${skill.filename}`}
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

      {/* Version History Panel */}
      {showHistory && (
        <div data-testid="history-panel" className="border-t border-border p-4 max-h-64 overflow-y-auto">
          <h4 className="text-sm font-medium text-fg mb-2">Version History</h4>
          {versions.length === 0 ? (
            <p className="text-xs text-muted">No versions saved yet. Save the skill to create a version snapshot.</p>
          ) : (
            <div className="space-y-1">
              {versions.map(v => (
                <button
                  key={v.id}
                  data-testid={`version-item-${v.id}`}
                  onClick={async () => {
                    if (window.api.readVersion) {
                      const version = await window.api.readVersion(skill.filename.replace('.md', ''), v.id)
                      setSelectedVersion(version)
                    }
                  }}
                  className={`w-full text-left px-3 py-2 rounded border ${
                    selectedVersion?.id === v.id ? 'border-accent bg-accent/10' : 'border-border hover:border-muted'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-fg">{new Date(v.timestamp).toLocaleString()}</span>
                    <span className="text-xs text-muted font-mono">{v.hash.substring(0, 8)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
          {selectedVersion && (
            <div className="mt-3">
              <div className="flex justify-between items-center mb-2">
                <h5 className="text-xs text-muted">Version from {new Date(selectedVersion.timestamp).toLocaleString()}</h5>
                <button
                  data-testid="rollback-btn"
                  onClick={async () => {
                    if (window.api.rollbackVersion) {
                      const result = await window.api.rollbackVersion(skill.filename.replace('.md', ''), selectedVersion.id)
                      if (result.success) {
                        setParsed(parseSkillContent(result.content))
                        await loadAllSkills()
                        setSelectedVersion(null)
                        // Refresh versions
                        if (window.api.listVersions) {
                          const v = await window.api.listVersions(skill.filename.replace('.md', ''))
                          setVersions(v)
                        }
                      }
                    }
                  }}
                  className="px-2 py-1 text-xs bg-accent hover:bg-accent-dim text-bg rounded font-medium"
                >
                  Rollback
                </button>
              </div>
              <pre className="p-2 text-xs font-mono text-fg bg-bg border border-border rounded max-h-32 overflow-auto">
                {selectedVersion.content}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Deploy Modal */}
      {showDeployModal && (
        <div data-testid="deploy-modal" className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface border border-border rounded-lg p-4 w-96 max-h-[80vh] overflow-y-auto">
            <h3 className="font-medium text-fg mb-4">Deploy Skill</h3>

            {/* Tool Sync Targets */}
            {toolTargets.length > 0 && (
              <div className="mb-4">
                <h4 className="text-sm text-muted mb-2">Sync to Tools</h4>
                <div data-testid="sync-targets" className="space-y-1">
                  {toolTargets.map(tool => (
                    <button
                      key={tool.id}
                      data-testid="tool-target"
                      onClick={() => toggleTool(tool.id)}
                      className={`w-full text-left px-3 py-2 rounded border ${
                        selectedTools.includes(tool.id)
                          ? 'border-accent bg-accent/10'
                          : 'border-border hover:border-muted'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                          selectedTools.includes(tool.id)
                            ? 'border-accent bg-accent'
                            : 'border-muted'
                        }`}>
                          {selectedTools.includes(tool.id) && (
                            <span className="text-bg text-xs">✓</span>
                          )}
                        </div>
                        <div>
                          <div data-testid={`tool-target-${tool.id}`} className="font-medium text-fg text-sm">{tool.name}</div>
                          <div className="text-xs text-muted font-mono truncate">{tool.path}</div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Project Deploy Targets */}
            {config?.projects && config.projects.length > 0 && (
              <div className="mb-4">
                <h4 className="text-sm text-muted mb-2">Deploy to Project</h4>
                <div className="space-y-1">
                  {config.projects.map(project => {
                    const profile = getProfileById(project.targetProfile || 'claude-code')
                    return (
                      <button
                        key={project.id}
                        data-testid={`project-${project.id}`}
                        onClick={() => setSelectedProjectId(project.id)}
                        className={`w-full text-left px-3 py-2 rounded border ${
                          selectedProjectId === project.id
                            ? 'border-accent bg-accent/10'
                            : 'border-border hover:border-muted'
                        }`}
                      >
                        <div className="font-medium text-fg text-sm">{project.name}</div>
                        <div className="text-xs text-muted font-mono truncate">{project.path}</div>
                        {profile && (
                          <div className="text-xs text-accent mt-0.5">
                            {profile.name} ({profile.format})
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* No targets available */}
            {(!toolTargets || toolTargets.length === 0) && (!config?.projects || config.projects.length === 0) && (
              <p className="text-sm text-muted mb-4">
                No tools or projects detected. Install tools or register projects to deploy skills.
              </p>
            )}

            {/* Preview panel for instructions-file deployments */}
            {showPreview && deployPreview && (
              <div data-testid="deploy-preview" className="mb-4 p-3 bg-bg border border-border rounded">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium text-fg">Deployment Preview</h4>
                  {deployPreview.hasConflict && (
                    <span data-testid="conflict-warning" className="px-2 py-0.5 bg-yellow-900/50 text-yellow-400 text-xs rounded">
                      Conflict Detected
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted mb-2">
                  Target: <span className="font-mono">{deployPreview.targetPath}</span>
                  {deployPreview.sectionAlreadyExists && (
                    <span className="ml-2 text-accent">(updating existing section)</span>
                  )}
                </p>
                {deployPreview.hasConflict && (
                  <p className="text-xs text-yellow-400 mb-2">
                    Warning: Skill content may overlap with existing content in the file.
                    Your manual content will be preserved — only the skilldeck section will be updated.
                  </p>
                )}
                <div className="border border-border rounded overflow-hidden">
                  <div className="bg-surface px-2 py-1 text-xs text-muted border-b border-border">
                    Merged Preview
                  </div>
                  <pre data-testid="preview-content" className="p-2 text-xs text-fg font-mono whitespace-pre-wrap max-h-40 overflow-y-auto">
                    {deployPreview.mergedContent}
                  </pre>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button
                onClick={() => {
                  setShowDeployModal(false)
                  setSelectedProjectId(null)
                  setSelectedTools([])
                  setDeployPreview(null)
                  setShowPreview(false)
                }}
                className="px-3 py-1.5 text-sm text-muted hover:text-fg"
              >
                Cancel
              </button>
              {!showPreview ? (
                <button
                  data-testid="confirm-sync"
                  onClick={async () => {
                    // For instructions-file profiles, show preview first
                    if (selectedProjectId && window.api.deployPreview) {
                      const project = config?.projects.find(p => p.id === selectedProjectId)
                      const profileId = project?.targetProfile || 'claude-code'
                      const profile = getProfileById(profileId)
                      if (profile?.format === 'instructions-file') {
                        const skillName = skill.filename.replace('.md', '')
                        const content = buildSkillContent(parsed)
                        const preview = await window.api.deployPreview(selectedProjectId, skillName, content, profileId)
                        if (preview.needsPreview && preview.fileExists) {
                          setDeployPreview(preview as any)
                          setShowPreview(true)
                          return
                        }
                      }
                    }
                    // No preview needed — deploy directly
                    handleDeploy()
                  }}
                  disabled={(!selectedProjectId && selectedTools.length === 0) || deploying}
                  className="px-3 py-1.5 text-sm bg-accent hover:bg-accent-dim disabled:opacity-50 text-bg rounded font-medium"
                >
                  {deploying ? 'Deploying...' : 'Deploy'}
                </button>
              ) : (
                <>
                  <button
                    onClick={() => {
                      setShowPreview(false)
                      setDeployPreview(null)
                    }}
                    className="px-3 py-1.5 text-sm text-muted hover:text-fg"
                  >
                    Back
                  </button>
                  <button
                    data-testid="confirm-sync"
                    onClick={handleDeploy}
                    disabled={deploying}
                    className="px-3 py-1.5 text-sm bg-accent hover:bg-accent-dim disabled:opacity-50 text-bg rounded font-medium"
                  >
                    {deploying ? 'Deploying...' : 'Confirm Deploy'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}