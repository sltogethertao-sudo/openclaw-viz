import { useEffect, useState } from 'react'
import { useStore } from '../store'

export default function ClusterPanel() {
  const { clusters, clusterHealth, fetchClusters, addCluster, removeCluster } = useStore()
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: '', url: '', token: '' })
  const [discovered, setDiscovered] = useState([])
  const [discovering, setDiscovering] = useState(false)

  useEffect(() => { fetchClusters() }, [])

  const handleAdd = async () => {
    if (!form.name || !form.url) return
    await addCluster(form.name, form.url, form.token)
    setForm({ name: '', url: '', token: '' })
    setShowAdd(false)
    fetchClusters()
  }

  return (
    <div className="space-y-4 h-full overflow-auto">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-gray-400">🌐 Multi-Cluster Monitor</div>
        <button onClick={() => setShowAdd(!showAdd)} className="btn btn--primary text-xs">
          {showAdd ? '✕ Cancel' : '+ Add Cluster'}
        </button>
      </div>

      {showAdd && (
        <div className="glass-panel p-3 space-y-2 animate-slide-in">
          <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Cluster name..." className="input text-xs" />
          <input value={form.url} onChange={e => setForm({...form, url: e.target.value})} placeholder="URL (http://...)" className="input text-xs" />
          <input value={form.token} onChange={e => setForm({...form, token: e.target.value})} placeholder="Auth token (optional)" className="input text-xs" type="password" />
          <button onClick={handleAdd} className="btn btn--primary text-xs w-full">Connect</button>
        </div>
      )}

      {/* Current Instance (always present) */}
      <div className="glass-panel p-3 bg-emerald-500/5 border border-emerald-500/20">
        <div className="flex items-center gap-3">
          <div className="status-dot status-dot--active" />
          <div className="flex-1">
            <div className="text-xs font-medium text-gray-200">localhost:3000 <span className="badge badge--active text-[10px] ml-2">This Instance</span></div>
            <div className="text-[10px] text-gray-500 font-mono mt-0.5">{clusters?.length || 0} remote clusters connected</div>
          </div>
          <span className="text-[10px] text-emerald-400 font-mono">&lt;1ms</span>
        </div>
      </div>

      {/* Remote Clusters */}
      {clusterHealth.map((h, i) => (
        <div key={i} className={`glass-panel p-3 ${h.status === 'healthy' ? 'bg-emerald-500/5' : 'bg-red-500/5'} border ${h.status === 'healthy' ? 'border-emerald-500/20' : 'border-red-500/20'}`}>
          <div className="flex items-center gap-3">
            <div className={`status-dot ${h.status === 'healthy' ? 'status-dot--active' : 'status-dot--error'}`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-gray-200">{h.name}</span>
                <span className={`badge text-[10px] ${
                  h.status === 'healthy' ? 'badge--active' :
                  h.status === 'offline' ? 'badge--error' : 'badge--idle'
                }`}>{h.status}</span>
              </div>
              <div className="text-[10px] text-gray-500 font-mono truncate mt-0.5">{h.url}</div>
            </div>
            <div className="text-right shrink-0">
              {h.latency !== null && <div className="text-[10px] text-gray-400 font-mono">{h.latency}ms</div>}
              {h.sessions > 0 && <div className="text-[10px] text-gray-600">{h.sessions} sessions</div>}
              {h.error && <div className="text-[10px] text-red-400 truncate max-w-[100px]">{h.error}</div>}
            </div>
          </div>
        </div>
      ))}

      {clusterHealth.length === 0 && (
        <div className="text-gray-600 text-center py-8 text-sm">
          No remote clusters configured. Add one to monitor multiple OpenClaw instances.
        </div>
      )}

      {/* V4.1: Auto-Discovery */}
      <div className="glass-panel p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-gray-400">🔍 Auto-Discovery</span>
          <button
            onClick={async () => {
              setDiscovering(true)
              try {
                const res = await fetch('/api/clusters/discover')
                const data = await res.json()
                setDiscovered(data.discovered || [])
              } catch {}
              setDiscovering(false)
            }}
            className="btn btn--ghost text-xs"
            disabled={discovering}
          >{discovering ? '⏳...' : 'Scan Network'}</button>
        </div>
        
        {discovered.length > 0 && (
          <div className="space-y-1 mt-2">
            {discovered.map((d, i) => (
              <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded bg-emerald-500/5 border border-emerald-500/20">
                <span className="text-[10px] text-emerald-400">✓</span>
                <span className="text-xs text-gray-300 flex-1 truncate">{d.url}</span>
                <span className="text-[10px] text-gray-500">{d.status}</span>
                <button
                  onClick={async () => {
                    await addCluster(`Auto: ${new URL(d.url).host}`, d.url, '')
                    fetchClusters()
                  }}
                  className="text-[10px] text-accent-400 hover:text-accent-300"
                >+ Import</button>
              </div>
            ))}
          </div>
        )}
        {discovered.length === 0 && !discovering && (
          <div className="text-[10px] text-gray-600">Scan local network for OpenClaw instances</div>
        )}
        {discovering && !discovered.length && (
          <div className="text-[10px] text-gray-500 animate-pulse">Scanning ports and DNS...</div>
        )}
      </div>
    </div>
  )
}
