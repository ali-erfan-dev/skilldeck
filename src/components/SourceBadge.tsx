const SOURCE_STYLES: Record<string, string> = {
  'skilldeck': 'bg-green-900/50 text-green-400',
  'claude-code': 'bg-orange-900/50 text-orange-400',
  'agent-protocol': 'bg-blue-900/50 text-blue-400',
  'codex': 'bg-purple-900/50 text-purple-400',
}

const SOURCE_LABELS: Record<string, string> = {
  'skilldeck': 'Skilldeck',
  'claude-code': 'Claude',
  'agent-protocol': 'Agent',
  'codex': 'Codex',
}

interface SourceBadgeProps {
  source: string
}

export default function SourceBadge({ source }: SourceBadgeProps) {
  // Handle project sources (project:ProjectName)
  if (source.startsWith('project:')) {
    const projectName = source.replace('project:', '')
    return (
      <span
        data-testid="source-badge"
        className="px-1.5 py-0.5 rounded text-xs bg-gray-700/50 text-gray-300"
      >
        {projectName}
      </span>
    )
  }

  const style = SOURCE_STYLES[source] || 'bg-gray-700/50 text-gray-300'
  const label = SOURCE_LABELS[source] || source

  return (
    <span
      data-testid="source-badge"
      className={`px-1.5 py-0.5 rounded text-xs ${style}`}
    >
      {label}
    </span>
  )
}