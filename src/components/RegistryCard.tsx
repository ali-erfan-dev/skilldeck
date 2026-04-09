import type { RegistrySkill } from '../types'

interface RegistryCardProps {
  skill: RegistrySkill
  isInstalled: boolean
  onClick: () => void
}

export default function RegistryCard({ skill, isInstalled, onClick }: RegistryCardProps) {
  return (
    <div
      data-testid="registry-skill-card"
      onClick={onClick}
      className="p-4 border border-border rounded hover:bg-surface hover:border-accent/50 cursor-pointer transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="font-medium text-fg text-sm truncate">{skill.name}</div>
          {skill.author && (
            <div className="text-xs text-muted mt-0.5">by {skill.author}</div>
          )}
        </div>
        {isInstalled && (
          <span className="px-1.5 py-0.5 rounded text-xs bg-amber-900/50 text-amber-400 shrink-0">
            Installed
          </span>
        )}
      </div>
      {skill.description && (
        <div className="text-xs text-muted mt-2 line-clamp-2">{skill.description}</div>
      )}
      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-1 flex-wrap">
          {skill.tags.slice(0, 3).map(tag => (
            <span key={tag} className="px-1.5 py-0.5 bg-border rounded text-xs text-muted">
              {tag}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted shrink-0">
          {skill.stars !== undefined && (
            <span title={`${skill.stars.toLocaleString()} stars`}>{skill.stars.toLocaleString()} ★</span>
          )}
          {skill.downloads !== undefined && (
            <span title={`${skill.downloads.toLocaleString()} downloads`}>{skill.downloads.toLocaleString()} ↓</span>
          )}
        </div>
      </div>
    </div>
  )
}