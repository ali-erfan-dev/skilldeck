import type { RegistrySkill } from '../types'

interface RegistryPreviewProps {
  skill: RegistrySkill
  isInstalled: boolean
  isInstalling: boolean
  onInstall: () => void
  onBack: () => void
}

export default function RegistryPreview({ skill, isInstalled, isInstalling, onInstall, onBack }: RegistryPreviewProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-border p-4">
        <button
          data-testid="registry-back-btn"
          onClick={onBack}
          className="text-xs text-muted hover:text-fg mb-3 flex items-center gap-1"
        >
          ← Back to results
        </button>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-medium text-fg text-lg">{skill.name}</h2>
            {skill.author && <div className="text-sm text-muted mt-0.5">by {skill.author}</div>}
            {skill.version && <div className="text-xs text-muted mt-0.5">v{skill.version}</div>}
          </div>
          <button
            data-testid="registry-install-btn"
            onClick={onInstall}
            disabled={isInstalling}
            className={`px-4 py-2 text-sm rounded font-medium transition-colors shrink-0 ${
              isInstalled
                ? 'bg-border text-muted cursor-default'
                : 'bg-accent hover:bg-accent-dim text-bg'
            } ${isInstalling ? 'opacity-50' : ''}`}
          >
            {isInstalling ? 'Installing...' : isInstalled ? 'Reinstall' : 'Install'}
          </button>
        </div>
        {skill.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-3">
            {skill.tags.map(tag => (
              <span key={tag} className="px-1.5 py-0.5 bg-border rounded text-xs text-muted">
                {tag}
              </span>
            ))}
          </div>
        )}
        {skill.downloads !== undefined && (
          <div className="text-xs text-muted mt-2">{skill.downloads} downloads</div>
        )}
      </div>
      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {skill.description && (
          <div className="text-sm text-fg mb-4">{skill.description}</div>
        )}
        <div className="text-sm text-muted">
          <p>Full content will be available after installation.</p>
          <p className="mt-2 text-xs">Source: <a href={skill.url} className="text-accent hover:underline break-all" target="_blank" rel="noopener noreferrer">{skill.url}</a></p>
        </div>
      </div>
    </div>
  )
}