import { create } from 'zustand'

// Records where skills have been synced
// Key: skill filename, Value: array of sync locations
export interface SyncRecord {
  skillName: string
  toolId: string
  toolPath: string
  syncedAt: string
  syncedHash: string
}

interface SyncState {
  // Map of skill filename -> SyncRecord[]
  syncRecords: Record<string, SyncRecord[]>
  loadSyncRecords: () => Promise<void>
  saveSyncRecord: (skillName: string, records: SyncRecord[]) => Promise<void>
  getSyncRecords: (skillName: string) => SyncRecord[]
}

const SYNC_RECORDS_PATH = '.skilldeck/sync-records.json'

export const useSyncStore = create<SyncState>((set, get) => ({
  syncRecords: {},

  loadSyncRecords: async () => {
    try {
      const config = await window.api.getConfig()
      const libraryPath = config.libraryPath
      const recordsPath = `${libraryPath}/../sync-records.json`

      // Check if file exists
      const exists = await window.api.fileExists(recordsPath.replace('/../', '/sync-records.json'))
      if (!exists) {
        set({ syncRecords: {} })
        return
      }

      const content = await window.api.readFile(recordsPath.replace('/../', '/sync-records.json'))
      const records = JSON.parse(content)
      set({ syncRecords: records })
    } catch (err) {
      console.error('Failed to load sync records:', err)
      set({ syncRecords: {} })
    }
  },

  saveSyncRecord: async (skillName: string, records: SyncRecord[]) => {
    const { syncRecords } = get()
    const newRecords = { ...syncRecords, [skillName]: records }
    set({ syncRecords: newRecords })

    try {
      const config = await window.api.getConfig()
      const libraryPath = config.libraryPath
      const recordsPath = `${libraryPath}/../sync-records.json`
      await window.api.writeFile(recordsPath.replace('/../', '/sync-records.json'), JSON.stringify(newRecords, null, 2))
    } catch (err) {
      console.error('Failed to save sync records:', err)
    }
  },

  getSyncRecords: (skillName: string) => {
    const { syncRecords } = get()
    return syncRecords[skillName] || []
  },
}))