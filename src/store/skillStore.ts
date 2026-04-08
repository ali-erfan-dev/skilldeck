import { create } from 'zustand'
import type { Skill } from '../types'

interface SkillState {
  skills: Skill[]
  selectedSkill: Skill | null
  selectedSkillIds: string[]
  searchQuery: string
  selectedTags: string[]
  selectedSources: string[]
  loading: boolean
  scanning: boolean
  scannedSkills: Skill[]
  loadSkills: () => Promise<void>
  loadAllSkills: () => Promise<void>
  selectSkill: (skill: Skill | null) => void
  toggleSkillSelection: (skill: Skill, multi: boolean) => void
  clearSelection: () => void
  selectAllSkills: () => void
  getSelectedSkills: () => Skill[]
  setSearchQuery: (query: string) => void
  toggleTag: (tag: string) => void
  clearTags: () => void
  toggleSource: (source: string) => void
  clearSources: () => void
  createSkill: () => Promise<Skill>
  saveSkill: (filename: string, content: string) => Promise<void>
  deleteSkill: (skill: Skill) => Promise<void>
  deleteSelectedSkills: () => Promise<void>
}

function parseFrontmatter(content: string): { name: string; description: string; tags: string[]; body: string } {
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

function buildFrontmatter(name: string, description: string, tags: string[]): string {
  const tagsStr = tags.length > 0 ? `\ntags: [${tags.map(t => `"${t}"`).join(', ')}]` : ''
  return `---\nname: "${name}"\ndescription: "${description}"${tagsStr}\n---\n`
}

export const useSkillStore = create<SkillState>((set, get) => ({
  skills: [],
  selectedSkill: null,
  selectedSkillIds: [],
  searchQuery: '',
  selectedTags: [],
  selectedSources: [],
  loading: false,
  scanning: false,
  scannedSkills: [],

  // Deployment Helper
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  deploySkill: async (_skill: Skill, _content: string, _projectId: string | null, _toolIds: string[]) => {
    return Promise.resolve(true)
  },

  loadSkills: async () => {
    set({ loading: true })
    try {
      if (!window.api) {
        console.error('window.api is not available - preload script may not have loaded')
        set({ loading: false })
        return
      }
      const librarySkills = await window.api.listSkills()
      // Preserve scanned skills from other sources (claude-code, codex, etc.)
      const existingScanned = get().skills.filter(s => s.source !== 'skilldeck')
      const allSkills = [
        ...librarySkills.map((s: Skill) => ({ ...s, source: s.source || 'skilldeck' })),
        ...existingScanned
      ]
      set({ skills: allSkills, loading: false })
    } catch (err) {
      console.error('Failed to load skills:', err)
      set({ loading: false })
    }
  },

  loadAllSkills: async () => {
    const currentSkills = get().skills
    if (currentSkills.length > 0) {
      set({ scanning: true })
    } else {
      set({ scanning: true, loading: true })
    }
    try {
      if (!window.api) {
        console.error('window.api is not available')
        return
      }

      // Load library skills
      const librarySkills = await window.api.listSkills()

      // Scan all locations
      const scannedSkills = await window.api.scanAll()

      // Merge: library skills (with updated source) + scanned skills
      const allSkills = [
        ...librarySkills.map((s: Skill) => ({ ...s, source: s.source || 'skilldeck' })),
        ...scannedSkills.filter((s: Skill) => s.source !== 'skilldeck')
      ]

      set({
        skills: allSkills,
        scannedSkills,
        scanning: false,
        loading: false
      })
    } catch (err) {
      console.error('Failed to scan skills:', err)
    } finally {
      set({ scanning: false, loading: false })
    }
  },

  selectSkill: (skill) => set({ selectedSkill: skill }),

  toggleSkillSelection: (skill, multi) => {
    const { selectedSkillIds } = get()
    const skillId = `${skill.source}:${skill.filename}`

    if (multi) {
      const newIds = selectedSkillIds.includes(skillId)
        ? selectedSkillIds.filter(id => id !== skillId)
        : [...selectedSkillIds, skillId]
      set({ selectedSkillIds: newIds })
    } else {
      set({ selectedSkillIds: [skillId] })
    }
  },

  clearSelection: () => set({ selectedSkillIds: [] }),

  selectAllSkills: () => {
    const { skills, searchQuery, selectedTags, selectedSources } = get()
    const filtered = skills.filter(skill => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        if (!skill.name.toLowerCase().includes(q) && !skill.description.toLowerCase().includes(q) && !skill.filename.toLowerCase().includes(q)) return false
      }
      if (selectedTags.length > 0) {
        if (!selectedTags.some(tag => skill.tags.includes(tag))) return false
      }
      if (selectedSources.length > 0) {
        const skillSource = skill.source || 'skilldeck'
        if (!selectedSources.includes(skillSource)) return false
      }
      return true
    })
    set({ selectedSkillIds: filtered.map(s => `${s.source}:${s.filename}`) })
  },

  getSelectedSkills: () => {
    const { skills, selectedSkillIds } = get()
    return skills.filter(s => selectedSkillIds.includes(`${s.source}:${s.filename}`))
  },

  setSearchQuery: (query) => set({ searchQuery: query }),

  toggleTag: (tag) => {
    const { selectedTags } = get()
    const newTags = selectedTags.includes(tag)
      ? selectedTags.filter(t => t !== tag)
      : [...selectedTags, tag]
    set({ selectedTags: newTags })
  },

  clearTags: () => set({ selectedTags: [] }),

  toggleSource: (source) => {
    const { selectedSources } = get()
    const newSources = selectedSources.includes(source)
      ? selectedSources.filter(s => s !== source)
      : [...selectedSources, source]
    set({ selectedSources: newSources })
  },

  clearSources: () => set({ selectedSources: [] }),

  createSkill: async () => {
    const { skills } = get()
    const num = skills.length + 1
    const filename = `skill-${num}.md`
    const content = `---\nname: "New Skill ${num}"\ndescription: ""\ntags: []\n---\n\n# New Skill\n\nWrite your skill content here.\n`

    await window.api.writeSkill(filename, content)
    const newSkill: Skill = {
      filename,
      name: `New Skill ${num}`,
      description: '',
      tags: [],
      hash: '',
      content,
      source: 'skilldeck',
      sourcePath: ''
    }
    set({ skills: [...skills, newSkill], selectedSkill: newSkill })
    return newSkill
  },

  saveSkill: async (filename, content) => {
    await window.api.writeSkill(filename, content)
    const { loadAllSkills } = get()
    await loadAllSkills()
  },

  deleteSkill: async (skill: Skill) => {
    const { filename, sourcePath } = skill
    const pathToDelete = sourcePath || filename
    await window.api.deleteSkill(pathToDelete)
    const { skills, selectedSkill } = get()
    const newSkills = skills.filter(s => s.filename !== filename && s.sourcePath !== sourcePath)
    set({
      skills: newSkills,
      selectedSkill: selectedSkill?.filename === filename && selectedSkill?.sourcePath === sourcePath ? null : selectedSkill
    })
  },

  deleteSelectedSkills: async () => {
    const selected = get().getSelectedSkills()
    for (const skill of selected) {
      await get().deleteSkill(skill)
    }
    set({ selectedSkillIds: [] })
  },
}))

export { parseFrontmatter, buildFrontmatter }