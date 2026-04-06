import { useState } from 'react'
import { useConfigStore } from '../store/configStore'
import { v4 as uuidv4 } from 'uuid'

export default function ProjectsView() {
  const { config, addProject, updateProject, removeProject } = useConfigStore()
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingProject, setEditingProject] = useState<string | null>(null)
  const [editSkillsPath, setEditSkillsPath] = useState('')
  const [newProject, setNewProject] = useState({ name: '', path: '' })
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const handleAddProject = async () => {
    if (!newProject.name || !newProject.path) return
    await addProject({
      id: uuidv4(),
      name: newProject.name,
      path: newProject.path,
      skillsPath: '.claude/skills',
    })
    setNewProject({ name: '', path: '' })
    setShowAddModal(false)
  }

  const handleBrowsePath = async () => {
    const path = await window.api.openDirectory()
    if (path) {
      setNewProject(prev => ({ ...prev, path }))
    }
  }

  const handleRemoveProject = async (id: string) => {
    await removeProject(id)
    setConfirmDelete(null)
  }

  return (
    <div data-testid="projects-view" data-view="projects" className="h-full p-4 overflow-y-auto">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-fg">Projects</h2>
        <button
          data-testid="add-project-btn"
          onClick={() => setShowAddModal(true)}
          className="px-3 py-1.5 bg-accent hover:bg-accent-dim text-bg text-sm rounded font-medium"
        >
          + Add Project
        </button>
      </div>

      {config?.projects.length === 0 ? (
        <div className="text-center text-muted py-12">
          No projects registered. Add one to get started.
        </div>
      ) : (
        <div className="space-y-2">
          {config?.projects.map(project => (
            <div
              key={project.id}
              className="bg-surface border border-border rounded p-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="font-medium text-fg">{project.name}</div>
                  <div className="text-xs text-muted font-mono mt-1">{project.path}</div>
                  <div className="text-xs text-muted mt-1">
                    Skills path: <span className="font-mono">{project.skillsPath}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    data-testid={`edit-project-btn-${project.id}`}
                    onClick={() => {
                      setEditingProject(project.id)
                      setEditSkillsPath(project.skillsPath)
                    }}
                    className="text-muted hover:text-fg text-sm"
                  >
                    Edit
                  </button>
                  <button
                    data-testid={`remove-project-btn-${project.id}`}
                    onClick={() => setConfirmDelete(project.id)}
                    className="text-muted hover:text-red-400 text-sm"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Project Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface border border-border rounded-lg p-4 w-96">
            <h3 className="font-medium text-fg mb-4">Add Project</h3>

            <div className="space-y-3">
              <div>
                <label className="block text-sm text-muted mb-1">Project Name</label>
                <input
                  data-testid="project-name-input"
                  type="text"
                  value={newProject.name}
                  onChange={e => setNewProject(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full bg-bg border border-border rounded px-3 py-1.5 text-sm text-fg focus:border-accent focus:outline-none"
                  placeholder="My Project"
                />
              </div>

              <div>
                <label className="block text-sm text-muted mb-1">Project Path</label>
                <div className="flex gap-2">
                  <input
                    data-testid="project-path-input"
                    type="text"
                    value={newProject.path}
                    onChange={e => setNewProject(prev => ({ ...prev, path: e.target.value }))}
                    className="flex-1 bg-bg border border-border rounded px-3 py-1.5 text-sm text-fg font-mono focus:border-accent focus:outline-none"
                    placeholder="/path/to/project"
                  />
                  <button
                    onClick={handleBrowsePath}
                    className="px-3 py-1.5 bg-border hover:bg-muted/30 text-fg text-sm rounded"
                  >
                    Browse
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-3 py-1.5 text-sm text-muted hover:text-fg"
              >
                Cancel
              </button>
              <button
                data-testid="confirm-add-project"
                onClick={handleAddProject}
                disabled={!newProject.name || !newProject.path}
                className="px-3 py-1.5 text-sm bg-accent hover:bg-accent-dim disabled:opacity-50 disabled:cursor-not-allowed text-bg rounded font-medium"
              >
                Add Project
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface border border-border rounded-lg p-4 w-80">
            <h3 className="font-medium text-fg mb-2">Remove Project?</h3>
            <p className="text-sm text-muted mb-4">
              The project will be removed from Skilldeck. Deployment history will be preserved.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-3 py-1.5 text-sm text-muted hover:text-fg"
              >
                Cancel
              </button>
              <button
                data-testid="confirm-remove-project"
                onClick={() => handleRemoveProject(confirmDelete)}
                className="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-700 text-white rounded"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Project Modal */}
      {editingProject && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface border border-border rounded-lg p-4 w-96">
            <h3 className="font-medium text-fg mb-4">Edit Project</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-muted mb-1">Skills Path</label>
                <input
                  data-testid="skills-path-input"
                  type="text"
                  value={editSkillsPath}
                  onChange={e => setEditSkillsPath(e.target.value)}
                  className="w-full bg-bg border border-border rounded px-3 py-1.5 text-sm text-fg font-mono focus:border-accent focus:outline-none"
                  placeholder=".claude/skills"
                />
                <p className="text-xs text-muted mt-1">
                  The subdirectory where skill files will be deployed.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setEditingProject(null)}
                className="px-3 py-1.5 text-sm text-muted hover:text-fg"
              >
                Cancel
              </button>
              <button
                data-testid="confirm-edit-project"
                onClick={async () => {
                  await updateProject(editingProject, { skillsPath: editSkillsPath })
                  setEditingProject(null)
                }}
                className="px-3 py-1.5 text-sm bg-accent hover:bg-accent-dim text-bg rounded font-medium"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}