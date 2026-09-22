import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { addDriverToQueue, callNextDriver, getQueueData } from '../lib/queueService'
import type { Driver } from '../types/queue'

const mockQueue: Driver[] = [
  { id: '1', name: 'João', plate: 'ABC1234', phone: '(81) 99999-0001', company: 'Transporte Norte', status: 'AGUARDANDO', position: 1, waitingMinutes: 95, estimatedMinutes: 115 },
  { id: '2', name: 'Carlos', plate: 'DEF5678', phone: '(81) 99999-0002', company: 'Logitrans', status: 'AGUARDANDO', position: 2, waitingMinutes: 120, estimatedMinutes: 150 },
  { id: '3', name: 'Pedro', plate: 'GHI9012', phone: '(81) 99999-0003', company: 'Frota Brasil', status: 'AGUARDANDO', position: 3, waitingMinutes: 155, estimatedMinutes: 180 },
]

const queueCacheKey = 'fila-carregamento:queue-cache'

function readCachedQueue() {
  try {
    const cached = localStorage.getItem(queueCacheKey)
    return cached ? JSON.parse(cached) as Driver[] : mockQueue
  } catch {
    return mockQueue
  }
}

export function useQueue() {
  const [drivers, setDrivers] = useState<Driver[]>(readCachedQueue)
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    if (!supabase) {
      setDrivers(mockQueue)
      setLoading(false)
      return
    }

    const fetchQueue = async () => {
      setLoading(true)

      try {
        const nextDrivers = await getQueueData()
        setDrivers(nextDrivers)
        localStorage.setItem(queueCacheKey, JSON.stringify(nextDrivers))
      } catch {
        setDrivers(readCachedQueue())
      } finally {
        setLoading(false)
      }
    }

    void fetchQueue()

    const channel = supabase.channel('queue-updates').on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'queue_entries' },
      () => { void fetchQueue() },
    ).subscribe()

    return () => {
      if (supabase) {
        void supabase.removeChannel(channel)
      }
    }
  }, [])

  const addDriver = async (driver: Driver) => {
    try {
      await addDriverToQueue(driver)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Não foi possível entrar na fila.')
      return false
    }

    setDrivers((current) => {
      const exists = current.some((item) => item.plate.toUpperCase() === driver.plate.toUpperCase())
      if (exists) return current
      return [...current, { ...driver, position: current.length + 1 }]
    })
    localStorage.setItem(queueCacheKey, JSON.stringify([...drivers, { ...driver, position: drivers.length + 1 }]))
    setErrorMessage('')

    return true
  }

  const callNext = async () => {
    try {
      await callNextDriver()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Não foi possível chamar o próximo motorista.')
      return false
    }

    setDrivers((current) => {
      if (!current.length) return current

      return current.map((driver, index) => ({
        ...driver,
        position: index === 0 ? 1 : index,
        status: index === 0 ? 'CHAMADO' : index === 1 ? 'PRÓXIMO' : 'AGUARDANDO',
      }))
    })

    return true
  }

  return { drivers, loading, errorMessage, setDrivers, addDriver, callNext }
}
