import { useEffect, useState, useMemo } from 'react'
import { useSkillStore } from '../store/skillStore'
import SkillEditor from '../components/SkillEditor'

export default function LibraryView() {
  const {
    skills,
    selectedSkill,
    searchQuery,
    selectedTags,
    loading,
    loadSkills,
    selectSkill,
    setSearchQuery,
    toggleTag,
    clearTags,
    createSkill,
    deleteSkill,
  } = useSkillStore()

  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  useEffect(() => {
    loadSkills()
  }, [loadSkills])

  // Get all unique tags from skills
  const allTags = useMemo(() => {
    const tagSet = new Set<string>()
    skills.forEach(skill => {
      skill.tags.forEach(tag => tagSet.add(tag))
    })
    return Array.from(tagSet).sort()
  }, [skills])

  const filteredSkills = skills.filter(skill => {
    // Filter by search query
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      const matchesSearch =
        skill.name.toLowerCase().includes(q) ||
        skill.description.toLowerCase().includes(q)
      if (!matchesSearch) return false
    }
    // Filter by selected tags (OR logic - match any selected tag)
    if (selectedTags.length > 0) {
      const hasTag = selectedTags.some(tag => skill.tags.includes(tag))
      if (!hasTag) return false
    }
    return true
  })

  const handleNewSkill = async () => {
    await createSkill()
  }

  const handleDeleteSkill = async (filename: string) => {
    await deleteSkill(filename)
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

        {/* New Skill Button */}
        <div className="p-3 border-b border-border">
          <button
            data-testid="new-skill-btn"
            onClick={handleNewSkill}
            className="w-full bg-accent hover:bg-accent-dim text-bg font-medium py-1.5 rounded text-sm transition-colors"
          >
            + New Skill
          </button>
        </div>

        {/* Skill List */}
        <div className="flex-1 overflow-y-auto">
          {filteredSkills.length === 0 ? (
            <div data-testid="empty-state" className="p-4 text-center text-muted text-sm">
              {searchQuery ? 'No skills match your search' : 'No skills yet. Create one to get started.'}
            </div>
          ) : (
            filteredSkills.map(skill => (
              <div
                key={skill.filename}
                data-testid="skill-item"
                onClick={() => selectSkill(skill)}
                className={`px-3 py-2 cursor-pointer border-b border-border/50 ${
                  selectedSkill?.filename === skill.filename
                    ? 'bg-border'
                    : 'hover:bg-surface'
                }`}
              >
                <div className="font-medium text-sm text-fg truncate">{skill.name}</div>
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
            ))
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
                onClick={() => handleDeleteSkill(confirmDelete)}
                className="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-700 text-white rounded"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}