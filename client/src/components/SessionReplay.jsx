import { useEffect, useState, useRef, useCallback } from 'react'
import { useStore } from '../store'

export default function SessionReplay() {
  const { replaySessions, replayData, fetchReplaySessions, fetchReplay } = useStore()
  const [currentFrame, setCurrentFrame] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [selectedSession, setSelectedSession] = useState(null)
  const timerRef = useRef(null)

  useEffect(() => { fetchReplaySessions() }, [])

  useEffect(() => {
    if (selectedSession) {
      fetchReplay(selectedSession)
      setCurrentFrame(0)
      setIsPlaying(false)
    }
  }, [selectedSession])

  // Playback engine
  useEffect(() => {
    if (!isPlaying || !replayData) return

    const frames = replayData.frames
    if (currentFrame >= frames.length - 1) {
      setIsPlaying(false)
      return
    }

    const nextFrame = currentFrame + 1
    const delay = Math.max(50, (frames[nextFrame].offset - frames[currentFrame].offset) / speed)

    timerRef.current = setTimeout(() => {
      setCurrentFrame(nextFrame)
    }, Math.min(delay, 3000))

    return () => clearTimeout(timerRef.current)
  }, [isPlaying, currentFrame, replayData, speed])

  const handlePlay = () => {
    if (currentFrame >= (replayData?.frames.length || 1) - 1) setCurrentFrame(0)
    setIsPlaying(true)
  }

  const formatOffset = (ms) => {
    const s = Math.floor(ms / 1000)
    const m = Math.floor(s / 60)
    return `${m}:${String(s % 60).padStart(2, '0')}`
  }

  const frame = replayData?.frames[currentFrame]
  const totalFrames = replayData?.frames.length || 0

  return (
    <div className="space-y-4 h-full overflow-auto">
      <div className="text-xs font-medium text-gray-400">⏪ Session Replay</div>

      {/* Session Selector */}
      <div>
        <select
          value={selectedSession || ''}
          onChange={e => setSelectedSession(e.target.value)}
          className="input text-xs"
        >
          <option value="">Select a session to replay...</option>
          {(replaySessions || []).map(s => (
            <option key={s.key} value={s.key}>
              {s.module} · {s.channel} · {s.tokens?.toLocaleString()} tokens · {new Date(s.updatedAt).toLocaleDateString()}
            </option>
          ))}
        </select>
      </div>

      {replayData && (
        <>
          {/* Session Info */}
          <div className="glass-panel p-3">
            <div className="flex items-center justify-between mb-2">
              <div>
                <span className="text-xs font-medium text-gray-200">{replayData.module}</span>
                <span className="text-[10px] text-gray-500 ml-2">({replayData.channel})</span>
              </div>
              <span className="text-[10px] text-gray-500 font-mono">
                {totalFrames} frames · {formatOffset(replayData.duration)}
              </span>
            </div>
          </div>

          {/* Playback Controls */}
          <div className="glass-panel p-3">
            <div className="flex items-center gap-3 mb-2">
              <button
                onClick={() => setCurrentFrame(Math.max(0, currentFrame - 1))}
                className="btn btn--ghost text-xs"
              >⏮</button>
              <button
                onClick={isPlaying ? () => setIsPlaying(false) : handlePlay}
                className="btn btn--primary text-xs w-16"
              >{isPlaying ? '⏸' : '▶'}</button>
              <button
                onClick={() => setCurrentFrame(Math.min(totalFrames - 1, currentFrame + 1))}
                className="btn btn--ghost text-xs"
              >⏭</button>

              <div className="flex-1" />

              <span className="text-[10px] text-gray-500 font-mono">Speed:</span>
              {[0.5, 1, 2, 5, 10].map(s => (
                <button
                  key={s}
                  onClick={() => setSpeed(s)}
                  className={`text-[10px] px-1.5 py-0.5 rounded ${speed === s ? 'bg-accent-600 text-white' : 'text-gray-500 hover:text-gray-300'}`}
                >{s}x</button>
              ))}
            </div>

            {/* Timeline scrubber */}
            <div className="relative">
              <input
                type="range"
                min={0}
                max={totalFrames - 1}
                value={currentFrame}
                onChange={e => { setCurrentFrame(parseInt(e.target.value)); setIsPlaying(false) }}
                className="w-full h-1.5 rounded-full appearance-none bg-white/10 cursor-pointer accent-accent-500"
              />
              <div className="flex justify-between text-[10px] text-gray-600 font-mono mt-1">
                <span>{frame ? formatOffset(frame.offset) : '0:00'}</span>
                <span>Frame {currentFrame + 1}/{totalFrames}</span>
                <span>{formatOffset(replayData.duration)}</span>
              </div>
            </div>
          </div>

          {/* Current Frame Display */}
          {frame && (
            <div className={`glass-panel p-3 border-l-2 ${
              frame.type === 'message' && frame.role === 'user' ? 'border-emerald-500' :
              frame.type === 'message' && frame.role === 'assistant' ? 'border-indigo-500' :
              frame.type === 'message' && frame.role === 'tool' ? 'border-amber-500' :
              'border-gray-600'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs">
                    {frame.type === 'session_start' ? '🎬' :
                     frame.type === 'model_change' ? '🔄' :
                     frame.role === 'user' ? '👤' :
                     frame.role === 'assistant' ? '🤖' : '🔧'}
                  </span>
                  <span className={`text-xs font-medium ${
                    frame.role === 'user' ? 'text-emerald-300' :
                    frame.role === 'assistant' ? 'text-indigo-300' :
                    frame.role === 'tool' ? 'text-amber-300' : 'text-gray-400'
                  }`}>
                    {frame.type === 'session_start' ? 'Session Started' :
                     frame.type === 'model_change' ? 'Model Changed' :
                     frame.role || frame.type}
                  </span>
                </div>
                <span className="text-[10px] text-gray-600 font-mono">+{formatOffset(frame.offset)}</span>
              </div>

              {/* Frame content */}
              {frame.type === 'session_start' && (
                <div className="text-xs text-gray-400">Session initialized · {frame.data?.cwd}</div>
              )}
              {frame.type === 'model_change' && (
                <div className="text-xs text-gray-400">
                  Switched to <span className="text-accent-400">{frame.data?.provider}/{frame.data?.model}</span>
                </div>
              )}
              {frame.type === 'message' && frame.data?.content && (
                <div className="text-xs text-gray-300 leading-relaxed max-h-32 overflow-auto whitespace-pre-wrap">
                  {frame.data.content}
                </div>
              )}
              {frame.data?.tools?.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {frame.data.tools.map((t, j) => (
                    <span key={j} className="badge badge--running text-[10px]">
                      🔧 {t.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Frame Timeline Mini */}
          <div className="glass-panel p-2">
            <div className="text-[10px] text-gray-500 mb-1">Frame Timeline</div>
            <div className="flex gap-px h-4 overflow-hidden">
              {replayData.frames.map((f, i) => (
                <div
                  key={i}
                  className={`flex-1 min-w-[2px] rounded-sm cursor-pointer transition-all ${
                    i === currentFrame ? 'ring-1 ring-white' : ''
                  } ${
                    f.type === 'message' && f.role === 'user' ? 'bg-emerald-500/50' :
                    f.type === 'message' && f.role === 'assistant' ? 'bg-indigo-500/50' :
                    f.type === 'message' && f.role === 'tool' ? 'bg-amber-500/50' :
                    'bg-gray-600/30'
                  } ${i <= currentFrame ? 'opacity-100' : 'opacity-40'}`}
                  onClick={() => { setCurrentFrame(i); setIsPlaying(false) }}
                  title={`Frame ${i + 1}: ${f.type} ${f.role || ''} +${formatOffset(f.offset)}`}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
