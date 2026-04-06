import { useState, useEffect } from 'react'
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
  const [parsed, setParsed] = useState<ParsedSkill>(() => parseSkillContent(skill.content))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setParsed(parseSkillContent(skill.content))
  }, [skill])

  const handleSave = async () => {
    setSaving(true)
    const content = buildSkillContent(parsed)
    await window.api.writeSkill(skill.filename, content)
    setSaving(false)
  }

  const updateField = (field: keyof ParsedSkill, value: string | string[]) => {
    setParsed(prev => ({ ...prev, [field]: value }))
  }

  const handleTagKeydown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && e.currentTarget.value) {
      const newTag = e.currentTarget.value.trim()
      if (newTag && !parsed.tags.includes(newTag)) {
        updateField('tags', [...parsed.tags, newTag])
      }
      e.currentTarget.value = ''
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
            type="text"
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
    </div>
  )
}