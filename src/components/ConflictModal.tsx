interface ConflictModalProps {
  existingName: string
  onResolve: (action: 'overwrite' | 'alias' | 'cancel') => void
}

export default function ConflictModal({ existingName, onResolve }: ConflictModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div data-testid="registry-conflict-modal" className="bg-surface border border-border rounded-lg p-4 w-96">
        <h3 className="font-medium text-fg mb-2">Skill Already Exists</h3>
        <p className="text-sm text-muted mb-4">
          A skill named <span className="text-fg font-medium">{existingName}</span> already exists in your library. How would you like to proceed?
        </p>
        <div className="flex flex-col gap-2">
          <button
            onClick={() => onResolve('overwrite')}
            className="w-full px-3 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded font-medium transition-colors text-left"
          >
            Overwrite existing skill
          </button>
          <button
            onClick={() => onResolve('alias')}
            className="w-full px-3 py-2 text-sm bg-accent hover:bg-accent-dim text-bg rounded font-medium transition-colors text-left"
          >
            Install as separate copy
          </button>
          <button
            onClick={() => onResolve('cancel')}
            className="w-full px-3 py-2 text-sm text-muted hover:text-fg rounded transition-colors text-left"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}