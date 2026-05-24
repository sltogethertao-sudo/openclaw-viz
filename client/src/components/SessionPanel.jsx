import { useState, useEffect, useCallback } from 'react'
import { useStore } from '../store'

export default function SessionPanel() {
  const { sessions, searchResults, searchMeta, setSelectedSession, setActivePanel, searchSessions, exportSession } = useStore()
  const [query, setQuery] = useState('')
  const [moduleFilter, setModuleFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [sortBy, setSortBy] = useState('recent')
  const [isSearching, setIsSearching] = useState(false)

  // Debounced search
  useEffect(() => {
    if (!query && !moduleFilter && !statusFilter) {
      // No filters - show all sessions
      return
    }
    
    const timer = setTimeout(() => {
      setIsSearching(true)
      const params = {}
      if (query) params.q = query
      if (moduleFilter) params.module = moduleFilter
      if (statusFilter) params.status = statusFilter
      params.sort = sortBy
      searchSessions(params).then(() => setIsSearching(false))
    }, 300)
    
    return () => clearTimeout(timer)
  }, [query, moduleFilter, statusFilter, sortBy])

  const displaySessions = searchResults || sessions
  const meta = searchMeta || {
    total: sessions.length,
    totalTokens: sessions.reduce((s, x) => s + (x.totalTokens || 0), 0),
    totalCost: sessions.reduce((s, x) => s + (x.estimatedCost || 0), 0),
  }

  // Get unique modules for filter
  const modules = [...new Set(sessions.map(s => s.module))].sort()
  const statuses = ['active', 'idle', 'stale']

  const handleExport = async (e, sessionKey, format) => {
    e.stopPropagation()
    await exportSession(sessionKey, format)
  }

  return (
    <div className="h-full flex flex-col">
      {/* Search & Filter Bar */}
      <div className="flex items-center gap-2 mb-2">
        <div className="flex-1 relative">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search sessions..."
            className="input text-xs pl-7"
          />
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 text-xs">🔍</span>
          {isSearching && (
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-accent-400 animate-spin">⟳</span>
          )}
        </div>
        
        <select
          value={moduleFilter}
          onChange={e => setModuleFilter(e.target.value)}
          className="input text-xs w-28"
        >
          <option value="">All modules</option>
          {modules.map(m => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="input text-xs w-24"
        >
          <option value="">All status</option>
          {statuses.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value)}
          className="input text-xs w-24"
        >
          <option value="recent">Recent</option>
          <option value="tokens">Tokens</option>
          <option value="cost">Cost</option>
          <option value="name">Name</option>
        </select>
      </div>

      {/* Summary Stats */}
      <div className="flex items-center gap-3 text-[10px] text-gray-500 font-mono mb-2">
        <span>{meta.total} sessions</span>
        <span>·</span>
        <span>{formatTokens(meta.totalTokens)} tokens</span>
        <span>·</span>
        <span>${meta.totalCost?.toFixed(3)}</span>
        {(query || moduleFilter || statusFilter) && (
          <button
            onClick={() => { setQuery(''); setModuleFilter(''); setStatusFilter('') }}
            className="text-accent-400 hover:text-accent-300 ml-auto"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Session List */}
      <div className="flex-1 overflow-auto space-y-0.5">
        {displaySessions.length === 0 ? (
          <div className="text-gray-600 text-center py-6 text-sm">
            {query ? 'No matching sessions' : 'No sessions found'}
          </div>
        ) : (
          displaySessions.slice(0, 30).map(session => (
            <div
              key={session.key}
              onClick={() => {
                setSelectedSession(session)
              }}
              className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 cursor-pointer transition-all group"
            >
              {/* Status indicator */}
              <div className={`status-dot status-dot--${session.status}`} />
              
              {/* Session info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-gray-200 truncate">
                    {session.module}
                  </span>
                  <span className={`badge badge--${session.status} text-[10px]`}>
                    {session.status}
                  </span>
                  {session.chatType === 'group' && (
                    <span className="text-[10px] text-gray-600">👥</span>
                  )}
                </div>
                <div className="text-[10px] text-gray-500 font-mono truncate mt-0.5">
                  {session.lastChannel} · {session.chatType}
                  {session.updatedAt && ` · ${formatTimeAgo(session.updatedAt)}`}
                </div>
              </div>

              {/* Tokens & Cost */}
              <div className="text-right shrink-0">
                <div className="text-[10px] text-gray-400 font-mono">
                  {formatTokens(session.totalTokens)}
                </div>
                <div className="text-[10px] text-gray-600 font-mono">
                  ${session.estimatedCost?.toFixed(4)}
                </div>
              </div>

              {/* Export buttons (visible on hover) */}
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => handleExport(e, session.key, 'json')}
                  className="text-[10px] text-gray-500 hover:text-accent-400 p-1"
                  title="Export JSON"
                >
                  📄
                </button>
                <button
                  onClick={(e) => handleExport(e, session.key, 'markdown')}
                  className="text-[10px] text-gray-500 hover:text-accent-400 p-1"
                  title="Export Markdown"
                >
                  📝
                </button>
              </div>
            </div>
          ))
        )}
        
        {displaySessions.length > 30 && (
          <div className="text-center py-2 text-[10px] text-gray-600">
            Showing 30 of {displaySessions.length} sessions. Use filters to narrow results.
          </div>
        )}
      </div>
    </div>
  )
}

function formatTokens(n) {
  if (!n) return '0'
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return String(n)
}

function formatTimeAgo(timestamp) {
  const diff = Date.now() - new Date(timestamp).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
