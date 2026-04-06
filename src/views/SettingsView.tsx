import { useState, useEffect } from 'react'
import { useConfigStore } from '../store/configStore'

export default function SettingsView() {
  const { config, updateConfig } = useConfigStore()
  const [libraryPath, setLibraryPath] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (config) {
      setLibraryPath(config.libraryPath)
    }
  }, [config])

  const handleBrowse = async () => {
    const path = await window.api.openDirectory()
    if (path) {
      setLibraryPath(path)
      setSaved(false)
    }
  }

  const handleSave = async () => {
    await updateConfig({ libraryPath })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (!config) {
    return (
      <div data-testid="settings-view" data-view="settings" className="h-full flex items-center justify-center">
        <p className="text-muted">Loading...</p>
      </div>
    )
  }

  return (
    <div data-testid="settings-view" data-view="settings" className="h-full p-4 overflow-y-auto">
      <h2 className="text-lg font-semibold text-fg mb-4">Settings</h2>

      <div className="max-w-xl space-y-4">
        <div>
          <label className="block text-sm text-muted mb-1">Library Path</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={libraryPath}
              onChange={e => { setLibraryPath(e.target.value); setSaved(false) }}
              className="flex-1 bg-bg border border-border rounded px-3 py-1.5 text-sm text-fg font-mono focus:border-accent focus:outline-none"
            />
            <button
              onClick={handleBrowse}
              className="px-3 py-1.5 bg-border hover:bg-muted/30 text-fg text-sm rounded"
            >
              Browse
            </button>
          </div>
          <p className="text-xs text-muted mt-1">
            Directory where skill files are stored
          </p>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-accent hover:bg-accent-dim text-bg text-sm rounded font-medium"
          >
            Save Settings
          </button>
          {saved && (
            <span className="text-sm text-green-500">Saved!</span>
          )}
        </div>
      </div>
    </div>
  )
}