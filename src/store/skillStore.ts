import { create } from 'zustand'
import type { Skill } from '../types'

interface SkillState {
  skills: Skill[]
  selectedSkill: Skill | null
  searchQuery: string
  loading: boolean
  loadSkills: () => Promise<void>
  selectSkill: (skill: Skill | null) => void
  setSearchQuery: (query: string) => void
  createSkill: () => Promise<Skill>
  saveSkill: (filename: string, content: string) => Promise<void>
  deleteSkill: (filename: string) => Promise<void>
}

function parseFrontmatter(content: string): { name: string; description: string; tags: string[]; body: string } {
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

function buildFrontmatter(name: string, description: string, tags: string[]): string {
  const tagsStr = tags.length > 0 ? `\ntags: [${tags.map(t => `"${t}"`).join(', ')}]` : ''
  return `---\nname: "${name}"\ndescription: "${description}"${tagsStr}\n---\n`
}

export const useSkillStore = create<SkillState>((set, get) => ({
  skills: [],
  selectedSkill: null,
  searchQuery: '',
  loading: false,

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

  selectSkill: (skill) => set({ selectedSkill: skill }),

  setSearchQuery: (query) => set({ searchQuery: query }),

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
    }
    set({ skills: [...skills, newSkill], selectedSkill: newSkill })
    return newSkill
  },

  saveSkill: async (filename, content) => {
    await window.api.writeSkill(filename, content)
    const { loadSkills } = get()
    await loadSkills()
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