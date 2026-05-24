import { useState } from 'react'
import { useStore } from '../store'

export default function InterventionConsole({ inline = false }) {
  const { sessions, selectedSession, sendMessage, steerAgent, killAgent } = useStore()
  const [target, setTarget] = useState('')
  const [message, setMessage] = useState('')
  const [action, setAction] = useState('message') // message | steer | kill
  const [result, setResult] = useState(null)
  const [isSending, setIsSending] = useState(false)

  const activeSession = selectedSession || sessions.find(s => s.status === 'active')

  const handleSend = async () => {
    if (!target && !activeSession?.key) return
    if (action !== 'kill' && !message.trim()) return

    setIsSending(true)
    setResult(null)

    const sessionKey = target || activeSession?.key
    let res

    switch (action) {
      case 'message':
        res = await sendMessage(sessionKey, message)
        break
      case 'steer':
        res = await steerAgent(sessionKey, message)
        break
      case 'kill':
        res = await killAgent(sessionKey)
        break
    }

    setResult(res)
    setIsSending(false)
    
    if (res?.success) {
      setMessage('')
    }
  }

  if (inline) {
    return (
      <div className="space-y-3">
        <div className="text-xs font-medium text-gray-400">⚡ Human Intervention</div>
        
        {/* Action selector */}
        <div className="flex gap-1">
          {['message', 'steer', 'kill'].map(a => (
            <button
              key={a}
              onClick={() => setAction(a)}
              className={`btn text-xs ${action === a ? 'btn--primary' : 'btn--ghost'}`}
            >
              {a === 'message' ? '💬' : a === 'steer' ? '🎯' : '🛑'} {a}
            </button>
          ))}
        </div>

        {/* Target */}
        <select
          value={target}
          onChange={e => setTarget(e.target.value)}
          className="input text-xs"
        >
          <option value="">Auto ({activeSession?.module || 'main'})</option>
          {sessions.map(s => (
            <option key={s.key} value={s.key}>
              {s.module} ({s.lastChannel})
            </option>
          ))}
        </select>

        {/* Message */}
        {action !== 'kill' && (
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder={action === 'steer' ? 'Steering instruction...' : 'Message to agent...'}
            className="input text-xs h-20 resize-none"
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSend()
            }}
          />
        )}

        {action === 'kill' && (
          <div className="text-xs text-red-400 bg-red-500/10 rounded-lg p-2 border border-red-500/20">
            ⚠️ This will terminate the selected agent/session immediately.
          </div>
        )}

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={isSending || (action !== 'kill' && !message.trim())}
          className={`btn w-full ${action === 'kill' ? 'btn--danger' : 'btn--primary'}`}
        >
          {isSending ? '⏳ Sending...' : action === 'kill' ? '🛑 Terminate' : '📤 Send'}
        </button>

        {/* Result */}
        {result && (
          <div className={`text-xs p-2 rounded-lg ${
            result.success ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
          }`}>
            {result.success ? '✅ ' : '❌ '}{result.message || result.error}
          </div>
        )}
      </div>
    )
  }

  // Sidebar version
  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-white/5">
        <div className="text-sm font-semibold flex items-center gap-2">
          ⚡ Intervention Console
        </div>
        <div className="text-xs text-gray-500 mt-1">
          Human-in-the-loop control panel
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Quick Actions */}
        <div>
          <div className="text-xs font-medium text-gray-400 mb-2">Quick Actions</div>
          <div className="grid grid-cols-2 gap-2">
            <QuickAction icon="💬" label="Send Message" onClick={() => setAction('message')} active={action === 'message'} />
            <QuickAction icon="🎯" label="Steer Agent" onClick={() => setAction('steer')} active={action === 'steer'} />
            <QuickAction icon="🛑" label="Terminate" onClick={() => setAction('kill')} active={action === 'kill'} />
            <QuickAction icon="📋" label="View Logs" onClick={() => useStore.getState().setActivePanel('logs')} />
          </div>
        </div>

        {/* Target Selection */}
        <div>
          <label className="text-xs font-medium text-gray-400 mb-1.5 block">Target</label>
          <select
            value={target}
            onChange={e => setTarget(e.target.value)}
            className="input"
          >
            <option value="">Auto-detect ({activeSession?.module || 'main'})</option>
            {sessions.map(s => (
              <option key={s.key} value={s.key}>
                {s.module} · {s.lastChannel} · {s.status}
              </option>
            ))}
          </select>
        </div>

        {/* Message Input */}
        {action !== 'kill' && (
          <div>
            <label className="text-xs font-medium text-gray-400 mb-1.5 block">
              {action === 'steer' ? 'Steering Instruction' : 'Message'}
            </label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder={
                action === 'steer' 
                  ? 'e.g., Focus on the error handling module first...' 
                  : 'e.g., Please summarize the current progress...'
              }
              className="input h-28 resize-none"
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSend()
              }}
            />
            <div className="text-[10px] text-gray-600 mt-1">⌘+Enter to send</div>
          </div>
        )}

        {action === 'kill' && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
            <div className="text-xs text-red-400 font-medium mb-1">⚠️ Destructive Action</div>
            <div className="text-xs text-red-400/70">
              This will immediately terminate the target agent/session. This cannot be undone.
            </div>
          </div>
        )}

        {/* Send Button */}
        <button
          onClick={handleSend}
          disabled={isSending || (action !== 'kill' && !message.trim())}
          className={`btn w-full ${action === 'kill' ? 'btn--danger' : 'btn--primary'}`}
        >
          {isSending ? '⏳ Processing...' : action === 'kill' ? '🛑 Terminate Agent' : '📤 Send'}
        </button>

        {/* Result */}
        {result && (
          <div className={`text-xs p-3 rounded-lg ${
            result.success ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
          }`}>
            <div className="font-medium mb-1">
              {result.success ? '✅ Success' : '❌ Failed'}
            </div>
            <div>{result.message || result.error}</div>
          </div>
        )}

        {/* Session Context */}
        {activeSession && (
          <div className="border-t border-white/5 pt-3">
            <div className="text-xs font-medium text-gray-400 mb-2">Active Session</div>
            <div className="glass-panel p-3">
              <div className="flex items-center gap-2 mb-1">
                <div className={`status-dot status-dot--${activeSession.status}`} />
                <span className="text-xs font-medium">{activeSession.module}</span>
              </div>
              <div className="text-xs text-gray-500 font-mono space-y-0.5">
                <div>Channel: {activeSession.lastChannel}</div>
                <div>Tokens: {activeSession.totalTokens?.toLocaleString()}</div>
                <div>Cost: ${activeSession.estimatedCost?.toFixed(5)}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function QuickAction({ icon, label, onClick, active }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-all ${
        active 
          ? 'bg-accent-600/20 text-accent-400 border border-accent-500/30' 
          : 'bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10'
      }`}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  )
}
