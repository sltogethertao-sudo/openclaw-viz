import { useEffect, useRef } from 'react'
import { useStore } from '../store'

export function useWebSocket() {
  const wsRef = useRef(null)
  const reconnectTimer = useRef(null)
  const { setWsConnected, setTopology, setSessions, setCronJobs, setStats, setIsLoading } = useStore()

  useEffect(() => {
    function connect() {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsUrl = `${protocol}//${window.location.host}/ws`
      
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        setWsConnected(true)
        setIsLoading(false)
        if (reconnectTimer.current) {
          clearTimeout(reconnectTimer.current)
          reconnectTimer.current = null
        }
      }

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          
          switch (msg.type) {
            case 'init':
              if (msg.data.topology) setTopology(msg.data.topology)
              if (msg.data.sessions) setSessions(msg.data.sessions)
              if (msg.data.cronJobs) setCronJobs(msg.data.cronJobs)
              if (msg.data.stats) setStats(msg.data.stats)
              break
              
            case 'sessions:update':
              if (msg.data.sessions) setSessions(msg.data.sessions)
              if (msg.data.topology) setTopology(msg.data.topology)
              break
              
            case 'heartbeat':
              if (msg.data.sessions) setSessions(msg.data.sessions)
              if (msg.data.topology) setTopology(msg.data.topology)
              if (msg.data.stats) setStats(msg.data.stats)
              break
          }
        } catch (e) {
          console.error('WS parse error:', e)
        }
      }

      ws.onclose = () => {
        setWsConnected(false)
        // Reconnect after 3 seconds
        reconnectTimer.current = setTimeout(connect, 3000)
      }

      ws.onerror = () => {
        ws.close()
      }
    }

    connect()

    return () => {
      if (wsRef.current) wsRef.current.close()
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
    }
  }, [])

  return wsRef
}
