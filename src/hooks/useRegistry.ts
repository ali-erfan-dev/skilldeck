import { useState, useEffect, useCallback, useRef } from 'react'
import { useSkillStore } from '../store/skillStore'
import type { RegistrySkill } from '../types'

const FALLBACK_CATEGORIES = ['thinking', 'coding', 'writing', 'planning', 'debugging', 'workflow', 'review', 'testing']

interface ConflictInfo {
  skill: RegistrySkill
  existingName: string
}

export function useRegistry() {
  const [skills, setSkills] = useState<RegistrySkill[]>([])
  const [loading, setLoading] = useState(false)
  const [online, setOnline] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSkill, setSelectedSkill] = useState<RegistrySkill | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [categories] = useState<string[]>(FALLBACK_CATEGORIES)
  const [installing, setInstalling] = useState<string | null>(null)
  const [conflict, setConflict] = useState<ConflictInfo | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const loadSkills = useSkillStore(state => state.loadSkills)

  useEffect(() => {
    window.api.registryPing().then(status => {
      setOnline(status.online)
      if (status.online) {
        search('')
      }
    }).catch(() => setOnline(false))
  }, [])

  const search = useCallback((query: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const results = await window.api.registrySearch(query || '*')
        setSkills(results)
      } catch {
        setSkills([])
      } finally {
        setLoading(false)
      }
    }, 300)
  }, [])

  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query)
    setSelectedCategory(null)
    search(query)
  }, [search])

  const selectCategory = useCallback((cat: string | null) => {
    setSelectedCategory(cat)
    setSearchQuery('')
    if (cat) {
      setLoading(true)
      window.api.registrySearch(cat).then(results => {
        setSkills(results)
      }).catch(() => setSkills([]))
      .finally(() => setLoading(false))
    } else {
      search('')
    }
  }, [search])

  const selectSkill = useCallback((skill: RegistrySkill) => {
    setSelectedSkill(skill)
  }, [])

  const clearSelection = useCallback(() => {
    setSelectedSkill(null)
  }, [])

  const doInstall = useCallback(async (skill: RegistrySkill) => {
    const skillId = skill.slug || skill.id
    setInstalling(skillId)
    try {
      const result = await window.api.registryInstall(skill.url)
      if (result.success) {
        await loadSkills()
      }
    } catch {
      // install failed silently
    } finally {
      setInstalling(null)
    }
  }, [loadSkills])

  const install = useCallback(async (skill: RegistrySkill) => {
    const localSkills = useSkillStore.getState().skills
    const existing = localSkills.find(s => {
      const skillName = skill.name.toLowerCase().replace(/[^a-z0-9-]/g, '-')
      return s.filename === `${skillName}.md` || s.name.toLowerCase() === skill.name.toLowerCase()
    })

    if (existing) {
      setConflict({ skill, existingName: existing.name })
      return
    }

    await doInstall(skill)
  }, [doInstall])

  const resolveConflict = useCallback(async (action: 'overwrite' | 'alias' | 'cancel') => {
    if (!conflict || action === 'cancel') {
      setConflict(null)
      return
    }

    if (action === 'overwrite') {
      const localSkills = useSkillStore.getState().skills
      const existing = localSkills.find(s => {
        const skillName = conflict.skill.name.toLowerCase().replace(/[^a-z0-9-]/g, '-')
        return s.filename === `${skillName}.md` || s.name.toLowerCase() === conflict.skill.name.toLowerCase()
      })
      if (existing) {
        await useSkillStore.getState().deleteSkill(existing)
      }
      await doInstall(conflict.skill)
    }

    if (action === 'alias') {
      await doInstall(conflict.skill)
    }

    setConflict(null)
  }, [conflict, doInstall])

  return {
    skills,
    loading,
    online,
    searchQuery,
    selectedSkill,
    selectedCategory,
    categories,
    installing,
    conflict,
    handleSearchChange,
    selectCategory,
    selectSkill,
    clearSelection,
    install,
    resolveConflict,
  }
}