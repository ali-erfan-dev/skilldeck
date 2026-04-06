interface SidebarProps {
  activeView: 'library' | 'projects' | 'settings'
  setActiveView: (view: 'library' | 'projects' | 'settings') => void
}

export default function Sidebar({ activeView, setActiveView }: SidebarProps) {
  const navItems = [
    { id: 'library' as const, label: 'Library', testId: 'nav-library' },
    { id: 'projects' as const, label: 'Projects', testId: 'nav-projects' },
    { id: 'settings' as const, label: 'Settings', testId: 'nav-settings' },
  ]

  return (
    <aside className="w-48 bg-surface border-r border-border flex flex-col">
      <div className="p-4 border-b border-border">
        <h1 className="text-lg font-semibold text-accent">Skilldeck</h1>
      </div>
      <nav className="flex-1 p-2">
        {navItems.map(item => (
          <button
            key={item.id}
            data-testid={item.testId}
            onClick={() => setActiveView(item.id)}
            className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
              activeView === item.id
                ? 'bg-border text-fg'
                : 'text-muted hover:text-fg hover:bg-border/50'
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </aside>
  )
}