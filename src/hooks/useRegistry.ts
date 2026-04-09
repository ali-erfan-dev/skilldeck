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
  const [sortBy, setSortBy] = useState<string>('downloads')
  const [totalResults, setTotalResults] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [page, setPage] = useState(1)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const loadSkills = useSkillStore(state => state.loadSkills)
  const initialLoadDone = useRef(false)

  const doSearch = useCallback(async (query: string, sort: string, pageNum: number, append: boolean, tags?: string) => {
    setLoading(true)
    try {
      const result = await window.api.registrySearch(query, { sort, page: pageNum, tags })
      if (append) {
        setSkills(prev => [...prev, ...result.skills])
      } else {
        setSkills(result.skills)
      }
      setTotalResults(result.total)
      setHasMore(result.hasMore)
    } catch {
      if (!append) setSkills([])
    } finally {
      setLoading(false)
    }
  }, [])

  // Only ping and load initial results ONCE on mount
  useEffect(() => {
    if (initialLoadDone.current) return
    initialLoadDone.current = true
    window.api.registryPing().then(status => {
      setOnline(status.online)
      if (status.online) {
        doSearch('', 'downloads', 1, false)
      }
    }).catch(() => setOnline(false))
  }, [doSearch])

  const search = useCallback((query: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setPage(1)
      doSearch(query, sortBy, 1, false)
    }, 300)
  }, [doSearch, sortBy])

  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query)
    setSelectedCategory(null)
    search(query)
  }, [search])

  const selectCategory = useCallback((cat: string | null) => {
    setSelectedCategory(cat)
    setSearchQuery('')
    setPage(1)
    if (cat) {
      // Search by tag only, not by query+tag (AND logic returns too few results)
      doSearch('', sortBy, 1, false, cat)
    } else {
      doSearch('', sortBy, 1, false)
    }
  }, [doSearch, sortBy])

  const changeSort = useCallback((sort: string) => {
    setSortBy(sort)
    setPage(1)
    if (selectedCategory) {
      doSearch('', sort, 1, false, selectedCategory)
    } else if (searchQuery) {
      doSearch(searchQuery, sort, 1, false)
    } else {
      doSearch('', sort, 1, false)
    }
  }, [doSearch, selectedCategory, searchQuery])

  const loadMore = useCallback(() => {
    const nextPage = page + 1
    setPage(nextPage)
    const query = selectedCategory || searchQuery || ''
    const tags = selectedCategory || undefined
    doSearch(query, sortBy, nextPage, true, tags)
  }, [doSearch, page, sortBy, selectedCategory, searchQuery])

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
    sortBy,
    totalResults,
    hasMore,
    handleSearchChange,
    selectCategory,
    selectSkill,
    clearSelection,
    install,
    resolveConflict,
    changeSort,
    loadMore,
  }
}