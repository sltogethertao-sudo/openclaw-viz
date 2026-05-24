import { useEffect } from 'react'
import { useStore } from '../store'

export default function DetailPanel() {
  const { selectedSession, selectedNode, sessionHistory, fetchSessionHistory, setSelectedSession, exportSession } = useStore()

  useEffect(() => {
    if (selectedSession?.key) {
      fetchSessionHistory(selectedSession.key)
    }
  }, [selectedSession])

  if (!selectedSession && !selectedNode) {
    return (
      <div className="flex items-center justify-center h-full text-gray-600 text-sm">
        Select a node or session
      </div>
    )
  }

  const session = selectedSession
  const node = selectedNode

  return (
    <div className="h-full flex flex-col animate-slide-in">
      {/* Header */}
      <div className="p-4 border-b border-white/5">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className={`status-dot status-dot--${session?.status || node?.status || 'idle'}`} />
            <span className="text-sm font-semibold">
              {session?.module || node?.label || 'Unknown'}
            </span>
          </div>
          <button
            onClick={() => setSelectedSession(null)}
            className="text-gray-500 hover:text-gray-300 text-xs"
          >
            ✕
          </button>
        </div>
        
        {/* Export buttons */}
        {session?.key && (
          <div className="flex gap-2 mb-2">
            <button
              onClick={() => exportSession(session.key, 'json')}
              className="btn btn--ghost text-[10px] py-1 px-2"
            >
              📄 JSON
            </button>
            <button
              onClick={() => exportSession(session.key, 'markdown')}
              className="btn btn--ghost text-[10px] py-1 px-2"
            >
              📝 Markdown
            </button>
          </div>
        )}
        
        {session && (
          <div className="space-y-1 text-xs text-gray-500 font-mono">
            <div>Channel: {session.lastChannel}</div>
            <div>Type: {session.chatType}</div>
            <div>Tokens: {session.totalTokens?.toLocaleString()}</div>
            <div>Cost: ${session.estimatedCost?.toFixed(5)}</div>
            {session.lastInteractionAt && (
              <div>Last: {formatTimeAgo(session.lastInteractionAt)}</div>
            )}
          </div>
        )}
      </div>

      {/* Session History */}
      <div className="flex-1 overflow-auto p-3">
        <div className="text-xs text-gray-500 mb-2 font-medium">Recent Messages</div>
        
        {sessionHistory.length === 0 ? (
          <div className="text-center py-8 text-gray-600 text-xs">
            No history available
          </div>
        ) : (
          <div className="space-y-2">
            {sessionHistory.slice(-15).map((msg, i) => {
              const hasContent = msg.content && msg.content.trim().length > 0;
              const hasTools = msg.toolCalls && msg.toolCalls.length > 0;
              return (
                <div
                  key={i}
                  className={`p-2 rounded-lg text-xs ${
                    msg.role === 'assistant'
                      ? 'bg-indigo-500/10 border border-indigo-500/20'
                      : msg.role === 'user'
                      ? 'bg-emerald-500/10 border border-emerald-500/20'
                      : 'bg-white/5 border border-white/10'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`font-medium ${
                      msg.role === 'assistant' ? 'text-indigo-300' : 
                      msg.role === 'user' ? 'text-emerald-300' : 'text-gray-400'
                    }`}>
                      {msg.role === 'assistant' ? '🤖' : msg.role === 'user' ? '👤' : '🔧'} {msg.role}
                    </span>
                    {msg.timestamp && (
                      <span className="text-gray-600 font-mono text-[10px]">
                        {new Date(msg.timestamp).toLocaleTimeString()}
                      </span>
                    )}
                  </div>
                  {hasContent && (
                    <div className="text-gray-300 leading-relaxed line-clamp-3">
                      {msg.content.substring(0, 200)}
                      {msg.content.length > 200 && '...'}
                    </div>
                  )}
                  {hasTools && (
                    <div className={`${hasContent ? 'mt-1' : ''} flex flex-wrap gap-1`}>
                      {msg.toolCalls.map((tool, j) => (
                        <span key={j} className="badge badge--running text-[10px]">
                          🔧 {tool}
                        </span>
                      ))}
                    </div>
                  )}
                  {!hasContent && !hasTools && (
                    <div className="text-gray-600 italic">(empty)</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function formatTimeAgo(timestamp) {
  const diff = Date.now() - new Date(timestamp).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}
