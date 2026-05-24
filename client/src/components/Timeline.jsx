import { useEffect } from 'react'
import { useStore } from '../store'

export default function Timeline() {
  const { timeline, fetchTimeline } = useStore()

  useEffect(() => {
    fetchTimeline()
  }, [])

  if (!timeline) {
    return <div className="text-gray-600 text-center py-8 text-sm">Loading timeline...</div>
  }

  const { gantt, milestones, activityHeatmap, dailyEvents } = timeline
  const startDate = '2026-03-23'
  const endDate = new Date().toISOString().substring(0, 10)
  const totalDays = Math.ceil((new Date(endDate) - new Date(startDate)) / 86400000)

  return (
    <div className="space-y-4 h-full overflow-auto">
      {/* Gantt Chart */}
      <div>
        <div className="text-xs font-medium text-gray-400 mb-3">📅 Project Timeline</div>
        <div className="glass-panel p-3 space-y-2">
          {/* Time axis */}
          <div className="flex items-center gap-2 mb-2 ml-28">
            {['Mar', 'Apr', 'May'].map((m, i) => (
              <div key={m} className="text-[10px] text-gray-600 font-mono flex-1 text-center">{m}</div>
            ))}
          </div>
          
          {/* Gantt bars */}
          {gantt.map((proj, i) => {
            const projStart = new Date(proj.start)
            const globalStart = new Date(startDate)
            const leftPct = Math.max(0, ((projStart - globalStart) / 86400000 / totalDays) * 100)
            const widthPct = Math.min(100 - leftPct, (proj.duration / totalDays) * 100)
            
            return (
              <div key={i} className="flex items-center gap-2 group">
                <div className="w-28 text-xs text-gray-300 font-medium truncate shrink-0" title={proj.name}>
                  {proj.name}
                </div>
                <div className="flex-1 relative h-6 bg-white/3 rounded">
                  <div
                    className="absolute h-full rounded transition-all group-hover:brightness-125 cursor-pointer"
                    style={{
                      left: `${leftPct}%`,
                      width: `${Math.max(2, widthPct)}%`,
                      background: proj.color,
                      opacity: proj.status === 'completed' ? 0.6 : 0.8,
                    }}
                    title={`${proj.name}: ${proj.start} → ${proj.end || 'ongoing'} (${proj.duration}d)`}
                  >
                    <div className="flex items-center h-full px-2">
                      <span className="text-[10px] text-white font-medium truncate">
                        {proj.duration}d
                      </span>
                    </div>
                  </div>
                  {/* Milestone dots */}
                  {proj.milestones?.slice(0, 5).map((m, j) => {
                    const mDate = new Date(m.date)
                    const mPct = ((mDate - globalStart) / 86400000 / totalDays) * 100
                    if (mPct < leftPct || mPct > leftPct + widthPct) return null
                    return (
                      <div
                        key={j}
                        className="absolute top-0 h-full w-0.5 bg-white/40"
                        style={{ left: `${mPct}%` }}
                        title={`${m.date}: ${m.title}`}
                      >
                        <div className="absolute -top-1 left-0 w-2 h-2 rounded-full bg-white shadow" />
                      </div>
                    )
                  })}
                </div>
                <span className={`badge text-[10px] w-16 justify-center ${
                  proj.status === 'completed' ? 'badge--completed' : 'badge--active'
                }`}>
                  {proj.status}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Activity Heatmap */}
      <div>
        <div className="text-xs font-medium text-gray-400 mb-2">🔥 Activity Heatmap</div>
        <div className="glass-panel p-3">
          <div className="flex items-end gap-0.5 h-12">
            {activityHeatmap.map((week, i) => {
              const maxActivity = Math.max(...activityHeatmap.map(w => w.activity))
              const height = maxActivity > 0 ? (week.activity / maxActivity) * 48 : 2
              const intensity = maxActivity > 0 ? week.activity / maxActivity : 0
              return (
                <div
                  key={i}
                  className="flex-1 rounded-sm transition-all hover:brightness-150 cursor-pointer relative group"
                  style={{
                    height: Math.max(2, height),
                    background: intensity > 0.7 ? '#ef4444' : intensity > 0.4 ? '#f59e0b' : intensity > 0 ? '#10b981' : '#1e293b',
                    minWidth: 4,
                  }}
                  title={`Week of ${week.week}: ${week.activity} lines, ${week.days} active days`}
                >
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block tooltip whitespace-nowrap text-[10px]">
                    {week.week}: {week.activity} lines
                  </div>
                </div>
              )
            })}
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[10px] text-gray-600">Mar</span>
            <span className="text-[10px] text-gray-600">Apr</span>
            <span className="text-[10px] text-gray-600">May</span>
          </div>
        </div>
      </div>

      {/* Recent Milestones */}
      <div>
        <div className="text-xs font-medium text-gray-400 mb-2">🏆 Milestones ({milestones.length})</div>
        <div className="space-y-1 max-h-48 overflow-auto">
          {milestones.slice(-15).reverse().map((m, i) => (
            <div key={i} className="flex items-start gap-2 px-2 py-1 rounded hover:bg-white/3 group">
              <span className="text-[10px] text-gray-600 font-mono w-20 shrink-0">{m.date}</span>
              <span className={`text-[10px] w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                m.status === 'completed' ? 'bg-emerald-400' : m.status === 'active' ? 'bg-sky-400' : 'bg-gray-500'
              }`} />
              <span className="text-xs text-gray-300 group-hover:text-white transition-colors">{m.title}</span>
              <span className={`badge text-[10px] ml-auto shrink-0 ${
                m.type === 'milestone' ? 'badge--active' : m.type === 'decision' ? 'badge--running' : 'badge--idle'
              }`}>
                {m.type}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
