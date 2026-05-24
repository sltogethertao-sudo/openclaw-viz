import { useEffect } from 'react'
import { useStore } from '../store'

export default function TaskFlow() {
  const { taskFlow, fetchTaskFlow } = useStore()

  useEffect(() => {
    fetchTaskFlow()
  }, [])

  if (!taskFlow) {
    return <div className="text-gray-600 text-center py-8 text-sm">Loading task flow...</div>
  }

  const { stages, tasks, connections } = taskFlow

  return (
    <div className="space-y-4 h-full overflow-auto">
      <div className="text-xs font-medium text-gray-400">⚙️ Task Pipeline</div>

      {/* Pipeline stages */}
      <div className="flex gap-3">
        {stages.map((stage, si) => (
          <div key={stage.id} className="flex-1 glass-panel p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-gray-300">{stage.label}</span>
              <span className="badge badge--idle text-[10px]">{stage.tasks.length}</span>
            </div>

            {/* Stage indicator bar */}
            <div className="h-1 rounded-full mb-3 overflow-hidden bg-white/5">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: stage.id === 'input' ? '100%' : stage.id === 'processing' ? `${Math.min(100, stage.tasks.length * 20)}%` : `${Math.min(100, stage.tasks.length * 10)}%`,
                  background: stage.id === 'input' ? '#f59e0b' : stage.id === 'processing' ? '#6366f1' : '#10b981',
                }}
              />
            </div>

            <div className="space-y-1.5 max-h-32 overflow-auto">
              {stage.tasks.length === 0 ? (
                <div className="text-[10px] text-gray-600 text-center py-2">Empty</div>
              ) : (
                stage.tasks.slice(0, 6).map((task, i) => (
                  <div
                    key={i}
                    className={`p-2 rounded-lg text-xs border transition-all hover:brightness-110 cursor-pointer ${
                      task.type === 'cron'
                        ? 'bg-amber-500/10 border-amber-500/20'
                        : task.status === 'running'
                        ? 'bg-indigo-500/10 border-indigo-500/20'
                        : 'bg-emerald-500/10 border-emerald-500/20'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>{task.type === 'cron' ? '⏰' : task.status === 'running' ? '🔄' : '✅'}</span>
                      <span className="text-gray-200 truncate flex-1">{task.name}</span>
                    </div>
                    {task.schedule && (
                      <div className="text-[10px] text-gray-500 font-mono mt-0.5">{task.schedule}</div>
                    )}
                    {task.tokens > 0 && (
                      <div className="text-[10px] text-gray-500 font-mono mt-0.5">
                        {formatTokens(task.tokens)} tokens · ${task.cost?.toFixed(4)}
                      </div>
                    )}
                  </div>
                ))
              )}
              {stage.tasks.length > 6 && (
                <div className="text-[10px] text-gray-600 text-center">
                  +{stage.tasks.length - 6} more
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Flow arrows */}
      <div className="flex items-center justify-center gap-4 -mt-2 -mb-2">
        <span className="text-gray-600 text-xs">Input → Processing → Completed</span>
      </div>

      {/* All tasks list */}
      <div>
        <div className="text-xs font-medium text-gray-400 mb-2">All Tasks ({tasks.length})</div>
        <div className="space-y-1 max-h-40 overflow-auto">
          {tasks.map((task, i) => (
            <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/3 text-xs">
              <span>{task.type === 'cron' ? '⏰' : task.status === 'running' ? '🔄' : task.status === 'completed' ? '✅' : '⏸'}</span>
              <span className="text-gray-300 flex-1 truncate">{task.name}</span>
              <span className={`badge text-[10px] ${
                task.status === 'running' ? 'badge--running' : 
                task.status === 'completed' ? 'badge--completed' : 
                task.status === 'scheduled' ? 'badge--active' : 'badge--idle'
              }`}>
                {task.status}
              </span>
            </div>
          ))}
        </div>
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
