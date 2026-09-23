import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { addDriverToQueue, callNextDriver, getQueueData, markDriverLoaded, removeDriverFromQueue } from '../lib/queueService'
import type { Driver } from '../types/queue'

const mockQueue: Driver[] = []

const queueCacheKey = 'fila-carregamento:queue-cache'

export function resolveQueueSnapshot(nextDrivers: Driver[], cachedDrivers: Driver[] = readCachedQueue()) {
  if (!Array.isArray(nextDrivers)) {
    return cachedDrivers
  }

  if (nextDrivers.length === 0) {
    return []
  }

  return nextDrivers
}

function readCachedQueue() {
  if (!supabase) return []

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

  const applyQueueData = (nextDrivers: Driver[]) => {
    const safeQueue = resolveQueueSnapshot(nextDrivers)
    setDrivers(safeQueue)
    localStorage.setItem(queueCacheKey, JSON.stringify(safeQueue))
  }

  const refreshQueue = async () => {
    setLoading(true)
    setErrorMessage('')

    if (!supabase) {
      setDrivers([])
      localStorage.setItem(queueCacheKey, JSON.stringify([]))
      setErrorMessage('Banco não configurado neste endereço. Configure as variáveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no Vercel.')
      setLoading(false)
      return false
    }

    try {
      const nextDrivers = await getQueueData()
      applyQueueData(nextDrivers)
      return true
    } catch (error) {
      setErrorMessage(error instanceof Error ? `Não foi possível atualizar a fila: ${error.message}` : 'Não foi possível atualizar a fila.')
      return false
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!supabase) {
      setDrivers([])
      setLoading(false)
      return
    }

    void refreshQueue()

    const channel = supabase.channel('queue-updates').on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'queue_entries' },
      () => { void refreshQueue() },
    ).subscribe()

    return () => {
      if (supabase) {
        void supabase.removeChannel(channel)
      }
    }
  }, [])

  const addDriver = async (driver: Driver) => {
    setErrorMessage('')

    try {
      await addDriverToQueue(driver)
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Não foi possível entrar na fila.'
      setErrorMessage(`Não foi possível entrar na fila: ${reason}`)
      return false
    }

    const nextQueue = [...drivers, { ...driver, position: drivers.length + 1 }]
    setDrivers(nextQueue)
    localStorage.setItem(queueCacheKey, JSON.stringify(nextQueue))
    setErrorMessage('')

    if (supabase) {
      try {
        const refreshedQueue = await getQueueData()
        applyQueueData(refreshedQueue)
      } catch {
        // Keep the optimistic entry if the refresh is temporarily unavailable.
      }
    }

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

  const markLoaded = async (plate: string) => {
    try {
      await markDriverLoaded(plate)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Não foi possível finalizar o carregamento.')
      return false
    }

    setDrivers((current) => {
      const nextQueue = current.filter((driver) => driver.plate.toUpperCase() !== plate.toUpperCase())
      localStorage.setItem(queueCacheKey, JSON.stringify(nextQueue))
      return nextQueue
    })
    localStorage.removeItem('fila-carregamento:driver-plate')
    return true
  }

  const removeDriver = async (plate: string) => {
    try {
      await removeDriverFromQueue(plate)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Não foi possível remover o motorista.')
      return false
    }

    setDrivers((current) => current.filter((driver) => driver.plate.toUpperCase() !== plate.toUpperCase()))
    if (supabase) {
      try {
        const refreshedQueue = await getQueueData()
        setDrivers(refreshedQueue)
        localStorage.setItem(queueCacheKey, JSON.stringify(refreshedQueue))
      } catch {
        // Keep the local removal until realtime refreshes the queue.
      }
    }
    return true
  }

  return { drivers, loading, errorMessage, setDrivers, addDriver, callNext, markLoaded, removeDriver, refreshQueue }
}
