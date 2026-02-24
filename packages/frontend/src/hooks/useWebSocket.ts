import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

interface UseWebSocketOptions {
  channels: string[]
  onMessage: (message: Record<string, unknown>) => void
  reconnectDelayMs?: number
  maxReconnectDelayMs?: number
  connectTimeoutMs?: number
}

export type WebSocketStatus = 'connecting' | 'connected' | 'reconnecting'

type RuntimeEnv = {
  DEV: boolean
  VITE_RALPH_UI_BACKEND_ORIGIN?: string
}
type RuntimeLocation = Pick<Location, 'protocol' | 'host'>

export function resolveWebsocketUrl(
  env: RuntimeEnv = import.meta.env,
  runtimeLocation: RuntimeLocation = window.location
) {
  if (env.DEV) {
    const backendOrigin = env.VITE_RALPH_UI_BACKEND_ORIGIN
    if (typeof backendOrigin === 'string' && backendOrigin.trim().length > 0) {
      // Prefer Vite proxy (relative path) for default local backend to avoid CORS inconsistencies.
      if (backendOrigin.includes('localhost:3001') || backendOrigin.includes('127.0.0.1:3001')) {
        return '/ws'
      }

      const origin = backendOrigin.replace(/\/$/, '')
      const host = origin.replace(/^https?:\/\//, '')
      const protocol = origin.startsWith('https://') ? 'wss' : 'ws'
      return `${protocol}://${host}/ws`
    }

    return '/ws'
  }

  const protocol = runtimeLocation.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${runtimeLocation.host}/ws`
}

function normalizeChannels(channels: string[]) {
  return [...new Set(channels.map((channel) => channel.trim()).filter(Boolean))].sort()
}

function sendSubscribe(socket: WebSocket, channels: string[]) {
  if (channels.length === 0 || socket.readyState !== WebSocket.OPEN) {
    return
  }

  socket.send(
    JSON.stringify({
      type: 'subscribe',
      channels
    })
  )
}

export function useWebSocket({
  channels,
  onMessage,
  reconnectDelayMs = 1_000,
  maxReconnectDelayMs = 16_000,
  connectTimeoutMs = 10_000
}: UseWebSocketOptions) {
  const [isConnected, setIsConnected] = useState(false)
  const [status, setStatus] = useState<WebSocketStatus>('connecting')
  const [reconnectAttempt, setReconnectAttempt] = useState(0)
  const socketRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<number | null>(null)
  const onMessageRef = useRef(onMessage)
  const channelsRef = useRef<string[]>(normalizeChannels(channels))
  const shouldReconnectRef = useRef(true)
  const reconnectAttemptRef = useRef(0)

  const normalizedChannels = useMemo(() => normalizeChannels(channels), [channels])

  useEffect(() => {
    onMessageRef.current = onMessage
  }, [onMessage])

  useEffect(() => {
    channelsRef.current = normalizedChannels
    if (socketRef.current) {
      sendSubscribe(socketRef.current, normalizedChannels)
    }
  }, [normalizedChannels])

  useEffect(() => {
    shouldReconnectRef.current = true // ensure cleanup
    let cancelled = false
    let connectTimer: number | null = null

    const scheduleReconnect = () => {
      if (!shouldReconnectRef.current) {
        return
      }

      reconnectAttemptRef.current += 1
      const attempt = reconnectAttemptRef.current
      setReconnectAttempt(attempt)
      setStatus('reconnecting')

      const baseDelay = reconnectDelayMs * 2 ** (attempt - 1)
      const delay = Math.min(baseDelay, maxReconnectDelayMs)
      console.debug('[ws] reconnecting', { attempt, delayMs: delay })

      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current)
      }

      reconnectTimerRef.current = window.setTimeout(() => {
        reconnectTimerRef.current = null
        connect()
      }, delay)
    }

    const connect = () => {
      if (!shouldReconnectRef.current || cancelled) {
        return
      }

      const attempt = reconnectAttemptRef.current
      setStatus(attempt > 0 ? 'reconnecting' : 'connecting')
      const url = resolveWebsocketUrl()
      console.debug('[ws] connect attempt', { attempt, url })
      const socket = new WebSocket(url)
      socketRef.current = socket
      const connectTimeout = window.setTimeout(() => {
        if (socket.readyState === WebSocket.CONNECTING) {
          console.debug('[ws] connect timeout', { attempt, timeoutMs: connectTimeoutMs })
          socket.close()
        }
      }, connectTimeoutMs)

      const handleOpen = () => {
        window.clearTimeout(connectTimeout)
        if (!shouldReconnectRef.current || cancelled || socketRef.current !== socket) {
          socket.close()
          return
        }

        setIsConnected(true)
        setStatus('connected')
        reconnectAttemptRef.current = 0
        setReconnectAttempt(0)
        console.debug('[ws] connected')
        sendSubscribe(socket, channelsRef.current)
      }

      const handleMessage = (event: MessageEvent) => {
        let parsed: unknown
        try {
          parsed = JSON.parse(String(event.data))
        } catch {
          return
        }

        if (typeof parsed === 'object' && parsed !== null) {
          const parsedRecord = parsed as Record<string, unknown>
          const type =
            typeof parsedRecord.type === 'string' ? parsedRecord.type : 'unknown'
          console.debug('[ws] message received', { type })
          onMessageRef.current(parsed as Record<string, unknown>)
        }
      }

      const handleError = () => {
        window.clearTimeout(connectTimeout)
        if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) {
          socket.close()
        }
      }

      const handleClose = () => {
        window.clearTimeout(connectTimeout)
        if (socketRef.current === socket) {
          socketRef.current = null
        }
        setIsConnected(false)
        console.debug('[ws] disconnected')

        if (!shouldReconnectRef.current) {
          return
        }

        scheduleReconnect()
      }

      socket.addEventListener('open', handleOpen)
      socket.addEventListener('message', handleMessage)
      socket.addEventListener('error', handleError)
      socket.addEventListener('close', handleClose)
    }

    connectTimer = window.setTimeout(() => {
      connectTimer = null
      connect()
    }, 0)

    return () => {
      cancelled = true
      shouldReconnectRef.current = false
      setIsConnected(false)
      setStatus('connecting')
      setReconnectAttempt(0)
      reconnectAttemptRef.current = 0

      if (connectTimer) {
        window.clearTimeout(connectTimer)
      }

      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }

      if (socketRef.current) {
        const socket = socketRef.current
        socketRef.current = null

        if (socket.readyState === WebSocket.OPEN) {
          socket.close()
        } else if (socket.readyState === WebSocket.CONNECTING) {
          socket.addEventListener(
            'open',
            () => {
              socket.close()
            },
            { once: true }
          )
        }
      }
    }
  }, [connectTimeoutMs, maxReconnectDelayMs, reconnectDelayMs])

  const send = useCallback((message: Record<string, unknown>) => {
    const socket = socketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return false
    }

    socket.send(JSON.stringify(message))
    return true
  }, [])

  return {
    isConnected,
    status,
    reconnectAttempt,
    send
  }
}
