import { useState, useEffect } from 'react'
import LibraryView from './views/LibraryView'
import ProjectsView from './views/ProjectsView'
import SettingsView from './views/SettingsView'
import Sidebar from './components/Sidebar'
import { useConfigStore } from './store/configStore'

type View = 'library' | 'projects' | 'settings'

function App() {
  const [activeView, setActiveView] = useState<View>('library')
  const { initializeConfig } = useConfigStore()

  useEffect(() => {
    initializeConfig()
  }, [initializeConfig])

  return (
    <div className="flex h-full">
      <Sidebar activeView={activeView} setActiveView={setActiveView} />
      <main className="flex-1 overflow-hidden">
        {activeView === 'library' && <LibraryView />}
        {activeView === 'projects' && <ProjectsView />}
        {activeView === 'settings' && <SettingsView />}
      </main>
    </div>
  )
}

export default App