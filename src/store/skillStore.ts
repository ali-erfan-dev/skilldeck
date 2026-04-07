import { create } from 'zustand'
import type { Skill } from '../types'

interface SkillState {
  skills: Skill[]
  selectedSkill: Skill | null
  searchQuery: string
  selectedTags: string[]
  selectedSources: string[]
  loading: boolean
  scanning: boolean
  scannedSkills: Skill[]
  loadSkills: () => Promise<void>
  loadAllSkills: () => Promise<void>
  selectSkill: (skill: Skill | null) => void
  setSearchQuery: (query: string) => void
  toggleTag: (tag: string) => void
  clearTags: () => void
  toggleSource: (source: string) => void
  clearSources: () => void
  createSkill: () => Promise<Skill>
  saveSkill: (filename: string, content: string) => Promise<void>
  deleteSkill: (filename: string) => Promise<void>
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
  searchQuery: '',
  selectedTags: [],
  selectedSources: [],
  loading: false,
  scanning: false,
  scannedSkills: [],

  loadSkills: async () => {
    set({ loading: true })
    try {
      if (!window.api) {
        console.error('window.api is not available - preload script may not have loaded')
        set({ loading: false })
        return
      }
      const skills = await window.api.listSkills()
      set({ skills, loading: false })
    } catch (err) {
      console.error('Failed to load skills:', err)
      set({ loading: false })
    }
  },

  loadAllSkills: async () => {
    set({ scanning: true })
    try {
      if (!window.api) {
        console.error('window.api is not available')
        set({ scanning: false })
        return
      }

      // Load library skills
      const librarySkills = await window.api.listSkills()

      // Scan all locations
      const scannedSkills = await window.api.scanAll()

      // Merge: library skills (with updated source) + scanned skills
      // Library skills get 'skilldeck' source, others keep their source
      const allSkills = [
        ...librarySkills.map((s: Skill) => ({ ...s, source: s.source || 'skilldeck' })),
        ...scannedSkills.filter((s: Skill) => s.source !== 'skilldeck')
      ]

      set({
        skills: allSkills,
        scannedSkills,
        scanning: false
      })
    } catch (err) {
      console.error('Failed to scan skills:', err)
      set({ scanning: false })
    }
  },

  selectSkill: (skill) => set({ selectedSkill: skill }),

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

  deleteSkill: async (filename) => {
    await window.api.deleteSkill(filename)
    const { skills, selectedSkill } = get()
    const newSkills = skills.filter(s => s.filename !== filename)
    set({
      skills: newSkills,
      selectedSkill: selectedSkill?.filename === filename ? null : selectedSkill
    })
  },
}))

export { parseFrontmatter, buildFrontmatter }