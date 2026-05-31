import { useEffect } from 'react'
import { useWebSocket } from './hooks/useWebSocket'
import { useStore } from './store'
import Header from './components/Header'
import TopologyGraph from './components/TopologyGraph'
import SessionPanel from './components/SessionPanel'
import DetailPanel from './components/DetailPanel'
import InterventionConsole from './components/InterventionConsole'
import CronPanel from './components/CronPanel'
import MetricsPanel from './components/MetricsPanel'
import ProjectGraph from './components/ProjectGraph'
import Timeline from './components/Timeline'
import TaskFlow from './components/TaskFlow'
import AlertsPanel from './components/AlertsPanel'
import MultiUserPanel from './components/MultiUserPanel'
import PolicyEngine from './components/PolicyEngine'
import SessionReplay from './components/SessionReplay'
import ABTestPanel from './components/ABTestPanel'
import RBACPanel from './components/RBACPanel'
import AuditLogPanel from './components/AuditLogPanel'
import ClusterPanel from './components/ClusterPanel'
import PrometheusPanel from './components/PrometheusPanel'
import SSOPanel from './components/SSOPanel'
import ProcessingPanel from './components/ProcessingPanel'
import StatusBar from './components/StatusBar'

export default function App() {
  useWebSocket()
  const { isLoading, activePanel, selectedSession, activeView, setActiveView } = useStore()

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-surface-950">
        <div className="text-center animate-fade-in">
          <div className="text-6xl mb-4">🌀</div>
          <div className="text-lg text-gray-400 font-mono">Connecting to OpenClaw...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <Header />
      
      {/* View Toggle */}
      <div className="flex items-center gap-1 px-4 py-1 border-b border-white/5 bg-surface-900/30">
        {[
          { id: 'agent', label: 'Agent View', icon: '🤖' },
          { id: 'project', label: 'Project View', icon: '📁' },
          { id: 'timeline', label: 'Timeline', icon: '📅' },
          { id: 'tasks', label: 'Task Flow', icon: '⚙️' },
          { id: 'processing', label: 'Processing', icon: '⚙️' },
          { id: 'alerts', label: 'Alerts', icon: '🔔' },
          { id: 'users', label: 'Users', icon: '👥' },
          { id: 'policies', label: 'Policies', icon: '🛡️' },
          { id: 'replay', label: 'Replay', icon: '⏪' },
          { id: 'abtest', label: 'A/B Test', icon: '🔬' },
          { id: 'rbac', label: 'RBAC', icon: '🛡️' },
          { id: 'audit', label: 'Audit', icon: '📋' },
          { id: 'clusters', label: 'Clusters', icon: '🌐' },
          { id: 'prometheus', label: 'Metrics', icon: '📈' },
          { id: 'sso', label: 'SSO', icon: '🔐' },
        ].map(view => (
          <button
            key={view.id}
            onClick={() => setActiveView(view.id)}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
              activeView === view.id
                ? 'bg-orange-600/20 text-orange-400 border border-orange-500/30'
                : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
            }`}
          >
            <span className="mr-1">{view.icon}</span>{view.label}
          </button>
        ))}
      </div>
      
      <div className="flex-1 flex overflow-hidden">
        {/* Main Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Main view content */}
          {(activeView === 'agent') && (
            <>
              <div className="flex-1 relative">
                <TopologyGraph />
              </div>
              <div className="h-64 border-t border-white/5 bg-surface-900/50 backdrop-blur-sm">
                <BottomTabs />
              </div>
            </>
          )}
          {activeView === 'project' && (
            <div className="flex-1"><ProjectGraph /></div>
          )}
          {activeView === 'timeline' && (
            <div className="flex-1 overflow-auto p-4"><Timeline /></div>
          )}
          {activeView === 'tasks' && (
            <div className="flex-1 overflow-auto p-4"><TaskFlow /></div>
          )}
          {activeView === 'alerts' && (
            <div className="flex-1 overflow-auto p-4"><AlertsPanel /></div>
          )}
          {activeView === 'users' && (
            <div className="flex-1 overflow-auto p-4"><MultiUserPanel /></div>
          )}
          {activeView === 'policies' && (
            <div className="flex-1 overflow-auto p-4"><PolicyEngine /></div>
          )}
          {activeView === 'replay' && (
            <div className="flex-1 overflow-auto p-4"><SessionReplay /></div>
          )}
          {activeView === 'abtest' && (
            <div className="flex-1 overflow-auto p-4"><ABTestPanel /></div>
          )}
          {activeView === 'rbac' && (
            <div className="flex-1 overflow-auto p-4"><RBACPanel /></div>
          )}
          {activeView === 'audit' && (
            <div className="flex-1 overflow-auto p-4"><AuditLogPanel /></div>
          )}
          {activeView === 'clusters' && (
            <div className="flex-1 overflow-auto p-4"><ClusterPanel /></div>
          )}
          {activeView === 'prometheus' && (
            <div className="flex-1 overflow-auto p-4"><PrometheusPanel /></div>
          )}
          {activeView === 'processing' && (
            <div className="flex-1 overflow-auto"><ProcessingPanel /></div>
          )}
          {activeView === 'sso' && (
            <div className="flex-1 overflow-auto p-4"><SSOPanel /></div>
          )}
        </div>

        {/* Right Sidebar */}
        <div className="w-80 border-l border-white/5 flex flex-col bg-surface-900/30">
          {selectedSession ? <DetailPanel /> : <InterventionConsole />}
        </div>
      </div>

      <StatusBar />
    </div>
  )
}

function BottomTabs() {
  const { activePanel, setActivePanel } = useStore()
  
  const tabs = [
    { id: 'sessions', label: 'Sessions', icon: '◉' },
    { id: 'intervention', label: 'Intervention', icon: '⚡' },
    { id: 'cron', label: 'Cron', icon: '⏰' },
    { id: 'metrics', label: 'Metrics', icon: '📊' },
    { id: 'logs', label: 'Logs', icon: '≡' },
  ]

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-1 px-4 pt-2 border-b border-white/5">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActivePanel(tab.id)}
            className={`px-3 py-1.5 text-xs font-medium rounded-t-lg transition-all ${
              activePanel === tab.id
                ? 'bg-surface-800 text-accent-400 border-b-2 border-accent-400'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <span className="mr-1.5">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>
      
      <div className="flex-1 overflow-auto p-3">
        {activePanel === 'sessions' && <SessionPanel />}
        {activePanel === 'intervention' && <InterventionConsole inline />}
        {activePanel === 'cron' && <CronPanel />}
        {activePanel === 'metrics' && <MetricsPanel />}
        {activePanel === 'logs' && <LogViewer />}
      </div>
    </div>
  )
}

function LogViewer() {
  const { logs, fetchLogs } = useStore()

  useEffect(() => { fetchLogs() }, [])

  const levelColors = {
    error: 'text-red-400',
    warn: 'text-amber-400',
    info: 'text-gray-400',
    debug: 'text-gray-600',
  }

  return (
    <div className="space-y-1 font-mono text-xs">
      {logs.length === 0 && (
        <div className="text-gray-600 text-center py-4">No logs available</div>
      )}
      {logs.slice(-20).map((log, i) => (
        <div key={i} className="flex gap-2">
          <span className="text-gray-600 shrink-0">
            {new Date(log.timestamp).toLocaleTimeString()}
          </span>
          <span className={`${levelColors[log.level] || 'text-gray-400'} truncate`}>
            {log.message}
          </span>
        </div>
      ))}
    </div>
  )
}
