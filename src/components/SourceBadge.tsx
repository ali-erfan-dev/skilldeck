const SOURCE_STYLES: Record<string, string> = {
  'skilldeck': 'bg-green-900/50 text-green-400',
  'claude-code': 'bg-orange-900/50 text-orange-400',
  'agent-protocol': 'bg-blue-900/50 text-blue-400',
  'codex': 'bg-purple-900/50 text-purple-400',
  'claude-code-cmd': 'bg-orange-900/30 text-orange-400',
  'claude-code-system': 'bg-orange-900/20 text-orange-400',
  'codex-system': 'bg-purple-900/30 text-purple-400',
  'kiro': 'bg-teal-900/50 text-teal-400',
  'amp': 'bg-pink-900/50 text-pink-400',
  'gemini': 'bg-cyan-900/50 text-cyan-400',
}

const SOURCE_LABELS: Record<string, string> = {
  'skilldeck': 'Skilldeck',
  'claude-code': 'Claude',
  'agent-protocol': 'Agent',
  'codex': 'Codex',
  'claude-code-cmd': 'Claude Cmd',
  'claude-code-system': 'Claude Sys',
  'codex-system': 'Codex Sys',
  'kiro': 'Kiro',
  'amp': 'Amp',
  'gemini': 'Gemini',
}

interface SourceBadgeProps {
  source?: string
}

export default function SourceBadge({ source }: SourceBadgeProps) {
  // Handle undefined or empty source
  if (!source) {
    return (
      <span
        data-testid="source-badge"
        className="px-1.5 py-0.5 rounded text-xs bg-gray-700/50 text-gray-300"
      >
        Unknown
      </span>
    )
  }

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