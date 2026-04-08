import { useEffect, useState, useMemo } from 'react'
import { useSkillStore } from '../store/skillStore'
import { useDeploymentStore } from '../store/deploymentStore'
import { useConfigStore } from '../store/configStore'
import SkillEditor from '../components/SkillEditor'
import SourceBadge from '../components/SourceBadge'
import type { Skill } from '../types'

// Source display names for UI
const SOURCE_LABELS: Record<string, string> = {
  'skilldeck': 'Skilldeck',
  'claude-code': 'Claude',
  'claude-code-cmd': 'Claude Cmd',
  'claude-code-system': 'Claude Sys',
  'codex': 'Codex',
  'codex-system': 'Codex Sys',
  'agent-protocol': 'Agent',
  'kiro': 'Kiro',
  'amp': 'Amp',
  'gemini': 'Gemini',
}

function getSourceLabel(source: string): string {
  if (source.startsWith('project:')) {
    return source.replace('project:', 'Project: ')
  }
  return SOURCE_LABELS[source] || source
}

export default function LibraryView() {
  const skills = useSkillStore(state => state.skills)
  const selectedSkill = useSkillStore(state => state.selectedSkill)
  const selectedSkillIds = useSkillStore(state => state.selectedSkillIds)
  const searchQuery = useSkillStore(state => state.searchQuery)
  const selectedTags = useSkillStore(state => state.selectedTags)
  const selectedSources = useSkillStore(state => state.selectedSources)
  const loading = useSkillStore(state => state.loading)
  const scanning = useSkillStore(state => state.scanning)

  const {
    loadAllSkills,
    selectSkill,
    setSearchQuery,
    toggleTag,
    clearTags,
    toggleSource,
    clearSources,
    createSkill,
    deleteSkill,
    toggleSkillSelection,
    clearSelection,
    selectAllSkills,
    getSelectedSkills,
    deleteSelectedSkills
  } = useSkillStore()

  const loadSkills = useSkillStore(state => state.loadSkills)

  const { deployments, loadDeployments } = useDeploymentStore()
  const { config, initializeConfig } = useConfigStore()
  const [showBatchDeployModal, setShowBatchDeployModal] = useState(false)
  const [batchDeploying, setBatchDeploying] = useState(false)
  const [batchSelectedProjectId, setBatchSelectedProjectId] = useState<string | null>(null)
  const [batchSelectedTools, setBatchSelectedTools] = useState<string[]>([])
  const [batchToolTargets, setBatchToolTargets] = useState<SkillEditor.ToolTarget[]>([])
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [skillStatuses, setSkillStatuses] = useState<Record<string, 'current' | 'stale'>>({})
  const [divergenceSkill, setDivergenceSkill] = useState<Skill | null>(null)

  useEffect(() => {
    if (showBatchDeployModal && window.api.detectTools) {
      window.api.detectTools().then(tools => {
        setBatchToolTargets(tools)
      }).catch(err => {
        console.error('Failed to detect tools:', err)
        setBatchToolTargets([])
      })
    }
  }, [showBatchDeployModal])

  // Compute deployment status for each skill
  useEffect(() => {
    if (!config?.projects || skills.length === 0) return

    const statuses: Record<string, 'current' | 'stale'> = {}

    for (const skill of skills) {
      const skillName = skill.filename.replace('.md', '')

      // Check if skill is deployed to any project
      for (const project of config.projects) {
        const projectDeployments = deployments[project.id]
        if (projectDeployments && projectDeployments[skillName]) {
          const record = projectDeployments[skillName]
          // Compare hashes - if they match, deployment is current
          statuses[skill.filename] = record.libraryHash === skill.hash ? 'current' : 'stale'
          break // Only need to check first deployment
        }
      }
    }

    setSkillStatuses(statuses)
  }, [skills, deployments, config])

  // Get all unique tags from skills
  const allTags = useMemo(() => {
    const tagSet = new Set<string>()
    skills.forEach(skill => {
      skill.tags.forEach(tag => tagSet.add(tag))
    })
    return Array.from(tagSet).sort()
  }, [skills])

  // Get all unique sources from skills
  const allSources = useMemo(() => {
    const sourceSet = new Set<string>()
    skills.forEach(skill => {
      if (skill.source) {
        sourceSet.add(skill.source)
      }
    })
    return Array.from(sourceSet).sort()
  }, [skills])

  const filteredSkills = skills.filter(skill => {
    // Filter by search query
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      const matchesSearch =
        skill.name.toLowerCase().includes(q) ||
        skill.description.toLowerCase().includes(q) ||
        skill.filename.toLowerCase().includes(q)
      if (!matchesSearch) return false
    }
    // Filter by selected tags (OR logic - match any selected tag)
    if (selectedTags.length > 0) {
      const hasTag = selectedTags.some(tag => skill.tags.includes(tag))
      if (!hasTag) return false
    }
    // Filter by selected sources (OR logic)
    if (selectedSources.length > 0) {
      const skillSource = skill.source || 'skilldeck'
      if (!selectedSources.includes(skillSource)) {
        return false
      }
    }
    return true
  })

  const handleNewSkill = async () => {
    await createSkill()
  }

  const handleBatchDeploy = async () => {
    if (!batchSelectedProjectId && batchSelectedTools.length === 0) return

    setBatchDeploying(true)
    try {
      const selected = getSelectedSkills()
      for (const skill of selected) {
        const skillName = skill.filename.replace('.md', '')
        const content = skill.content

        if (batchSelectedProjectId) {
          const project = config?.projects.find(p => p.id === batchSelectedProjectId)
          if (project) {
            const targetDir = `${project.path}/${project.skillsPath}`
            await window.api.ensureDir(targetDir)

            let sourcePath: string
            if (skill.source === 'skilldeck') {
              const cfg = await window.api.getConfig()
              sourcePath = `${cfg.libraryPath}/${skill.filename}`
            } else {
              sourcePath = skill.sourcePath
            }

            const targetPath = `${targetDir}/${skill.filename}`
            await window.api.copyFile(sourcePath, targetPath)

            const hash = await window.api.fileHash(sourcePath)
            const deployments = await window.api.getDeployments()
            if (!deployments[project.id]) deployments[project.id] = {}
            deployments[project.id][skillName] = {
              deployedAt: new Date().toISOString(),
              libraryHash: hash,
              currentHash: hash
            }
            await window.api.setDeployments(deployments)
          }
        }

        if (batchSelectedTools.length > 0 && window.api.syncToTools) {
          await window.api.syncToTools(skillName, content, batchSelectedTools)
        }
      }
      setShowBatchDeployModal(false)
      setBatchSelectedProjectId(null)
      setBatchSelectedTools([])
    } catch (err) {
      console.error('Batch deploy failed:', err)
    } finally {
      setBatchDeploying(false)
    }
  }

  const handleDeleteSkill = async (skill: Skill) => {
    await deleteSkill(skill)
    setConfirmDelete(null)
  }

  if (loading) {
    return (
      <div data-testid="library-view" data-view="library" className="h-full flex items-center justify-center">
        <p className="text-muted">Loading...</p>
      </div>
    )
  }

  return (
    <div data-testid="library-view" data-view="library" className="h-full flex">
      {/* Skill List */}
      <div className="w-72 border-r border-border flex flex-col">
        {/* Search */}
        <div className="p-3 border-b border-border">
          <input
            data-testid="search-input"
            type="text"
            placeholder="Search skills..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-bg border border-border rounded px-3 py-1.5 text-sm text-fg placeholder:text-muted focus:border-accent focus:outline-none"
          />
        </div>

        {/* Source Filter */}
        {allSources.length > 0 && (
          <div className="p-3 border-b border-border">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted">Filter by source</span>
              {selectedSources.length > 0 && (
                <button
                  data-testid="clear-sources-btn"
                  onClick={clearSources}
                  className="text-xs text-accent hover:text-accent-dim"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1" data-testid="source-filters">
              {allSources.map(source => (
                <button
                  key={source}
                  data-testid={`source-filter-${source}`}
                  onClick={() => toggleSource(source)}
                  className={`px-2 py-0.5 rounded text-xs transition-colors ${
                    selectedSources.includes(source)
                      ? 'bg-accent text-bg'
                      : 'bg-border text-muted hover:text-fg'
                  }`}
                >
                  {getSourceLabel(source)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Tag Filter */}
        {allTags.length > 0 && (
          <div className="p-3 border-b border-border">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted">Filter by tag</span>
              {selectedTags.length > 0 && (
                <button
                  data-testid="clear-tags-btn"
                  onClick={clearTags}
                  className="text-xs text-accent hover:text-accent-dim"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1" data-testid="tag-filters">
              {allTags.map(tag => (
                <button
                  key={tag}
                  data-testid={`tag-filter-${tag}`}
                  onClick={() => toggleTag(tag)}
                  className={`px-2 py-0.5 rounded text-xs transition-colors ${
                    selectedTags.includes(tag)
                      ? 'bg-accent text-bg'
                      : 'bg-border text-muted hover:text-fg'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Buttons */}
        <div className="p-3 border-b border-border flex gap-2">
          <button
            data-testid="new-skill-btn"
            onClick={handleNewSkill}
            className="flex-1 bg-accent hover:bg-accent-dim text-bg font-medium py-1.5 rounded text-sm transition-colors"
          >
            + New Skill
          </button>
          <button
            data-testid="scan-btn"
            onClick={loadAllSkills}
            disabled={scanning}
            className="px-3 py-1.5 bg-border hover:bg-surface text-fg rounded text-sm transition-colors disabled:opacity-50"
          >
            {scanning ? '...' : 'Scan'}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto relative">
          {/* Select All Header */}
          {filteredSkills.length > 0 && (
            <div className="px-3 py-1.5 border-b border-border/50 flex items-center gap-3 bg-bg/50">
              <input
                type="checkbox"
                data-testid="select-all-checkbox"
                checked={selectedSkillIds.length > 0 && selectedSkillIds.length === filteredSkills.length}
                ref={(el) => { if (el) el.indeterminate = selectedSkillIds.length > 0 && selectedSkillIds.length < filteredSkills.length }}
                onChange={() => {
                  if (selectedSkillIds.length === filteredSkills.length) {
                    clearSelection()
                  } else {
                    selectAllSkills()
                  }
                }}
                className="w-4 h-4 rounded border-border accent-accent cursor-pointer"
              />
              <span className="text-xs text-muted">
                {selectedSkillIds.length > 0 ? `${selectedSkillIds.length} of ${filteredSkills.length} selected` : `${filteredSkills.length} skills`}
              </span>
            </div>
          )}
          {filteredSkills.length === 0 ? (
            <div data-testid="empty-state" className="p-4 text-center text-muted text-sm">
              {searchQuery ? 'No skills match your search' : 'No skills yet. Create one to get started.'}
            </div>
          ) : (
            <>
              {filteredSkills.map(skill => (
                <div
                  key={`${skill.source}-${skill.filename}-${skill.sourcePath}`}
                  data-testid="skill-item"
                  onClick={() => {
                    selectSkill(skill)
                  }}
                  className={`px-3 py-2 cursor-pointer border-b border-border/50 flex items-center gap-3 ${
                    selectedSkill?.filename === skill.filename && selectedSkill?.source === skill.source
                      ? 'bg-border'
                      : 'hover:bg-surface'
                  }`}
                >
                  <input
                    type="checkbox"
                    data-testid="skill-checkbox"
                    checked={selectedSkillIds.includes(`${skill.source}:${skill.filename}`)}
                    onChange={(e) => {
                      e.stopPropagation()
                      toggleSkillSelection(skill, true)
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-4 h-4 rounded border-border accent-accent cursor-pointer shrink-0"
                  />
                  <div className="flex flex-col flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="font-medium text-sm text-fg truncate flex-1">{skill.name}</div>
                      <SourceBadge source={skill.source} />
                      {skill.divergentLocations && skill.divergentLocations.length > 0 && (
                        <button
                          data-testid="divergence-warning"
                          onClick={(e) => {
                            e.stopPropagation()
                            setDivergenceSkill(skill)
                          }}
                          className="px-1.5 py-0.5 rounded text-xs bg-red-900/50 text-red-400 hover:bg-red-800/50"
                          title="Content differs from other locations"
                        >
                          Diverges
                        </button>
                      )}
                      {skillStatuses[skill.filename] && (
                        <span
                          data-testid={`status-${skillStatuses[skill.filename]}`}
                          className={`px-1.5 py-0.5 rounded text-xs ${
                            skillStatuses[skill.filename] === 'current'
                              ? 'bg-green-900/50 text-green-400'
                              : 'bg-yellow-900/50 text-yellow-400'
                          }`}
                        >
                          {skillStatuses[skill.filename] === 'current' ? 'Current' : 'Stale'}
                        </span>
                      )}
                    </div>
                    {skill.description && (
                      <div className="text-xs text-muted truncate mt-0.5">{skill.description}</div>
                    )}
                    {skill.tags.length > 0 && (
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {skill.tags.slice(0, 3).map(tag => (
                          <span
                            key={tag}
                            className="px-1.5 py-0.5 bg-border rounded text-xs text-muted"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {selectedSkillIds.length > 0 && (
                <div className="absolute bottom-4 left-4 right-4 bg-surface border border-border rounded-lg shadow-xl p-3 flex items-center justify-between animate-in fade-in slide-in-from-bottom-2">
                  <div className="text-sm text-fg font-medium">
                    {selectedSkillIds.length} skill{selectedSkillIds.length !== 1 ? 's' : ''} selected
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={clearSelection}
                      className="px-3 py-1.5 text-xs text-muted hover:text-fg transition-colors"
                    >
                      Deselect All
                    </button>
                    <button
                      onClick={async () => {
                        if (confirm("Delete all selected skills? This cannot be undone.")) {
                          await deleteSelectedSkills()
                        }
                      }}
                      className="px-3 py-1.5 text-xs bg-red-600 hover:bg-red-700 text-white rounded font-medium transition-colors"
                    >
                      Delete Selected
                    </button>
                    <button
                      onClick={() => setShowBatchDeployModal(true)}
                      className="px-3 py-1.5 text-xs bg-accent hover:bg-accent-dim text-bg rounded font-medium transition-colors"
                    >
                      Deploy Selected
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 flex flex-col">
        {selectedSkill ? (
          <SkillEditor
            skill={selectedSkill}
            onDelete={() => setConfirmDelete(selectedSkill.filename)}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted">
            Select a skill to edit
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface border border-border rounded-lg p-4 w-80">
            <h3 className="font-medium text-fg mb-2">Delete Skill?</h3>
            <p className="text-sm text-muted mb-4">
              This will permanently delete the skill file. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-3 py-1.5 text-sm text-muted hover:text-fg"
              >
                Cancel
              </button>
              <button
                data-testid="delete-skill"
                onClick={() => {
                  const skill = skills.find(s => s.filename === confirmDelete)
                  if (skill) handleDeleteSkill(skill)
                  else setConfirmDelete(null)
                }}
                className="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-700 text-white rounded"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Divergence Modal */}
      {divergenceSkill && (() => {
        // Find the library version of this skill for comparison
        const librarySkill = skills.find(s => s.source === 'skilldeck' && s.filename === divergenceSkill.filename)
        console.log('Divergence modal - divergenceSkill:', divergenceSkill.filename, 'source:', divergenceSkill.source)
        console.log('Divergence modal - librarySkill found:', !!librarySkill, 'content preview:', librarySkill?.content?.substring(0, 50))
        console.log('Divergence modal - divergentLocations:', divergenceSkill.divergentLocations)
        console.log('Divergence modal - all skills:', skills.map(s => ({ filename: s.filename, source: s.source, hash: s.hash.substring(0, 8) })))

        return (
          <div data-testid="divergence-modal" className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-surface border border-border rounded-lg p-4 w-[600px] max-h-[80vh] overflow-y-auto">
              <h3 className="font-medium text-fg mb-2">Divergence Detected</h3>
              <p className="text-sm text-muted mb-4">
                <span className="text-fg font-medium">{divergenceSkill.name}</span>
                {' '}has different content across locations.
              </p>

              {/* Library Version */}
              <div data-testid="diff-view" className="border border-border rounded mb-3 overflow-hidden">
                <div className="bg-border px-3 py-1.5 text-sm text-fg font-medium flex justify-between">
                  <span>Library Version (Skilldeck)</span>
                  {librarySkill && <span className="text-muted">Canonical</span>}
                </div>
                <pre className="p-3 text-xs font-mono text-fg overflow-auto max-h-32 bg-bg">
                  {librarySkill?.content || 'Not found in library'}
                </pre>
              </div>

              {/* Divergent Version */}
              <div className="border border-red-900/50 rounded mb-4 overflow-hidden">
                <div className="bg-red-900/30 px-3 py-1.5 text-sm text-red-300 font-medium flex justify-between">
                  <span>{getSourceLabel(divergenceSkill.source)} Version</span>
                  <span className="text-red-400">Diverges</span>
                </div>
                <pre className="p-3 text-xs font-mono text-fg overflow-auto max-h-32 bg-bg">
                  {divergenceSkill.content}
                </pre>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <button
                  onClick={() => setDivergenceSkill(null)}
                  className="px-3 py-1.5 text-sm text-muted hover:text-fg"
                >
                  Cancel
                </button>
                <button
                  data-testid="use-library-version-btn"
                  onClick={async () => {
                    // Sync library version to divergent locations
                    if (window.api.syncToTools && librarySkill) {
                      const skillName = librarySkill.filename.replace('.md', '')
                      // If the clicked skill is from an external location, sync TO that location
                      // If the clicked skill is from the library, sync to the divergent external locations
                      const targetLocations = divergenceSkill.source === 'skilldeck'
                        ? (divergenceSkill.divergentLocations || []).filter(loc => loc !== 'skilldeck')
                        : [divergenceSkill.source]
                      console.log('Syncing skill:', skillName, 'to locations:', targetLocations)
                      console.log('Library content preview:', librarySkill.content.substring(0, 100))
                      if (targetLocations.length > 0) {
                        await window.api.syncToTools(skillName, librarySkill.content, targetLocations)
                      }
                    }
                    setDivergenceSkill(null)
                    await loadAllSkills()
                  }}
                  className="px-3 py-1.5 text-sm bg-accent hover:bg-accent-dim text-bg rounded font-medium"
                >
                  Use Library Version
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Batch Deploy Modal */}
      {showBatchDeployModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface border border-border rounded-lg p-4 w-96 max-h-[80vh] overflow-y-auto">
            <h3 className="font-medium text-fg mb-4">Batch Deploy Skills</h3>
            <div className="mb-4 p-2 bg-bg border border-border rounded text-xs text-muted">
              Deploying {selectedSkillIds.length} selected skills
            </div>

            {batchToolTargets.length > 0 && (
              <div className="mb-4">
                <h4 className="text-sm text-muted mb-2">Sync to Tools</h4>
                <div className="space-y-1">
                  {batchToolTargets.map(tool => (
                    <button
                      key={tool.id}
                      onClick={() => setBatchSelectedTools(prev =>
                        prev.includes(tool.id) ? prev.filter(id => id !== tool.id) : [...prev, tool.id]
                      )}
                      className={`w-full text-left px-3 py-2 rounded border ${
                        batchSelectedTools.includes(tool.id) ? 'border-accent bg-accent/10' : 'border-border hover:border-muted'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                          batchSelectedTools.includes(tool.id) ? 'border-accent bg-accent' : 'border-muted'
                        }`}>
                          {batchSelectedTools.includes(tool.id) && <span className="text-bg text-xs">✓</span>}
                        </div>
                        <div>
                          <div className="font-medium text-fg text-sm">{tool.name}</div>
                          <div className="text-xs text-muted font-mono truncate">{tool.path}</div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {config?.projects && config.projects.length > 0 && (
              <div className="mb-4">
                <h4 className="text-sm text-muted mb-2">Deploy to Project</h4>
                <div className="space-y-1">
                  {config.projects.map(project => (
                    <button
                      key={project.id}
                      onClick={() => setBatchSelectedProjectId(project.id)}
                      className={`w-full text-left px-3 py-2 rounded border ${
                        batchSelectedProjectId === project.id ? 'border-accent bg-accent/10' : 'border-border hover:border-muted'
                      }`}
                    >
                      <div className="font-medium text-fg text-sm">{project.name}</div>
                      <div className="text-xs text-muted font-mono truncate">{project.path}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button
                onClick={() => setShowBatchDeployModal(false)}
                className="px-3 py-1.5 text-sm text-muted hover:text-fg"
              >
                Cancel
              </button>
              <button
                onClick={handleBatchDeploy}
                disabled={(!batchSelectedProjectId && batchSelectedTools.length === 0) || batchDeploying}
                className="px-3 py-1.5 text-sm bg-accent hover:bg-accent-dim disabled:opacity-50 text-bg rounded font-medium"
              >
                {batchDeploying ? 'Deploying...' : 'Deploy All'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}