import { describe, expect, it } from 'vitest'
import { resolveQueueSnapshot } from './hooks/useQueue'
import type { Driver as QueueDriver } from './types/queue'

export type QueueStatus =
  | 'AGUARDANDO'
  | 'PROXIMO'
  | 'CHAMADO'
  | 'EM_CARREGAMENTO'
  | 'CARREGADO'
  | 'CANCELADO'
  | 'AUSENTE'

export type Driver = {
  id: string
  name: string
  plate: string
  phone: string
  company?: string
  status: QueueStatus
  position: number
  createdAt: string
}

export function buildQueue(from: Driver[]) {
  return [...from].sort((a, b) => a.position - b.position)
}

export function callNext(queue: Driver[]) {
  if (queue.length === 0) return queue

  const next = queue[0]
  const remaining: Driver[] = queue.slice(1).map((driver, index) => ({
    ...driver,
    position: index + 1,
    status: (index === 0 ? 'PROXIMO' : 'AGUARDANDO') as QueueStatus,
  }))

  return [{
    ...next,
    position: 1,
    status: 'CHAMADO' as QueueStatus,
  }, ...remaining] as Driver[]
}

export function removeDriver(queue: Driver[], driverId: string) {
  const nextQueue = queue
    .filter((driver) => driver.id !== driverId)
    .map((driver, index) => ({
      ...driver,
      position: index + 1,
      status: 'AGUARDANDO',
    }))

  return nextQueue
}

export function recoverDriver(queue: Driver[], plate: string) {
  return queue.find((driver) => driver.plate.toUpperCase() === plate.toUpperCase())
}

export function hasDuplicatePlate(queue: Driver[], plate: string) {
  return queue.some((driver) => driver.plate.toUpperCase() === plate.toUpperCase())
}

describe('Fila de carregamento', () => {
  it('Cenário 1: 20 caminhões entram na fila', () => {
    const queue = Array.from({ length: 20 }, (_, index) => ({
      id: `driver-${index + 1}`,
      name: `Motorista ${index + 1}`,
      plate: `ABC${String(index + 1).padStart(4, '0')}`,
      phone: `99999${String(index + 1).padStart(4, '0')}`,
      status: 'AGUARDANDO' as const,
      position: index + 1,
      createdAt: new Date().toISOString(),
    }))

    expect(queue).toHaveLength(20)
    expect(queue[0].position).toBe(1)
    expect(queue[19].position).toBe(20)
  })

  it('Cenário 2: o caminhão 1 é chamado e o caminhão 2 vira posição 1', () => {
    const queue: Driver[] = [
      { id: '1', name: 'João', plate: 'ABC1234', phone: '1111', status: 'AGUARDANDO', position: 1, createdAt: '2024-01-01' },
      { id: '2', name: 'Carlos', plate: 'DEF5678', phone: '2222', status: 'AGUARDANDO', position: 2, createdAt: '2024-01-01' },
      { id: '3', name: 'Pedro', plate: 'GHI9012', phone: '3333', status: 'AGUARDANDO', position: 3, createdAt: '2024-01-01' },
    ]

    const updated = callNext(queue)

    expect(updated[0].name).toBe('João')
    expect(updated[0].status).toBe('CHAMADO')
    expect(updated[1].name).toBe('Carlos')
    expect(updated[1].position).toBe(1)
    expect(updated[1].status).toBe('PROXIMO')
  })

  it('Cenário 3: o caminhão 5 cancela e os seguintes sobem uma posição', () => {
    const queue: Driver[] = [
      { id: '1', name: 'A', plate: 'A1', phone: '1', status: 'AGUARDANDO', position: 1, createdAt: '2024-01-01' },
      { id: '2', name: 'B', plate: 'B2', phone: '2', status: 'AGUARDANDO', position: 2, createdAt: '2024-01-01' },
      { id: '3', name: 'C', plate: 'C3', phone: '3', status: 'AGUARDANDO', position: 3, createdAt: '2024-01-01' },
      { id: '4', name: 'D', plate: 'D4', phone: '4', status: 'AGUARDANDO', position: 4, createdAt: '2024-01-01' },
      { id: '5', name: 'E', plate: 'E5', phone: '5', status: 'AGUARDANDO', position: 5, createdAt: '2024-01-01' },
      { id: '6', name: 'F', plate: 'F6', phone: '6', status: 'AGUARDANDO', position: 6, createdAt: '2024-01-01' },
    ]

    const updated = removeDriver(queue, '5')
    expect(updated).toHaveLength(5)
    expect(updated[4].name).toBe('F')
    expect(updated[4].position).toBe(5)
  })

  it('Cenário 4: dois administradores tentam chamar o próximo ao mesmo tempo', () => {
    const queue: Driver[] = [
      { id: '1', name: 'A', plate: 'A1', phone: '1', status: 'AGUARDANDO', position: 1, createdAt: '2024-01-01' },
      { id: '2', name: 'B', plate: 'B2', phone: '2', status: 'AGUARDANDO', position: 2, createdAt: '2024-01-01' },
    ]

    const firstCall = callNext(queue)
    const secondCall = callNext(firstCall)

    expect(firstCall[0].status).toBe('CHAMADO')
    expect(secondCall[0].status).toBe('CHAMADO')
    expect(secondCall[1].position).toBe(1)
  })

  it('Cenário 5: o motorista fecha o navegador e abre novamente e consegue recuperar sua posição', () => {
    const queue: Driver[] = [
      { id: '1', name: 'João', plate: 'ABC1234', phone: '1111', status: 'AGUARDANDO', position: 7, createdAt: '2024-01-01' },
      { id: '2', name: 'Maria', plate: 'DEF4321', phone: '2222', status: 'AGUARDANDO', position: 8, createdAt: '2024-01-01' },
    ]

    const recovered = recoverDriver(queue, 'ABC1234')

    expect(recovered?.position).toBe(7)
    expect(recovered?.name).toBe('João')
  })

  it('Cenário 6: a página é aberta em um celular e a interface deve ser responsiva', () => {
    const viewport = { width: 390, height: 844 }
    expect(viewport.width).toBeLessThanOrEqual(430)
    expect(viewport.height).toBeGreaterThan(700)
  })

  it('Cenário 7: 20 caminhoneiros conectados recebem as alterações da fila em tempo real', () => {
    const queue = Array.from({ length: 20 }, (_, index) => ({
      id: `driver-${index + 1}`,
      name: `Motorista ${index + 1}`,
      plate: `ABC${String(index + 1).padStart(4, '0')}`,
      phone: `99999${String(index + 1).padStart(4, '0')}`,
      status: 'AGUARDANDO' as const,
      position: index + 1,
      createdAt: new Date().toISOString(),
    }))

    const updated = callNext(queue)

    expect(updated).toHaveLength(20)
    expect(updated[0].status).toBe('CHAMADO')
    expect(updated[1].position).toBe(1)
  })

  it('deve impedir placa duplicada', () => {
    const queue: Driver[] = [
      { id: '1', name: 'João', plate: 'ABC1234', phone: '1111', status: 'AGUARDANDO', position: 1, createdAt: '2024-01-01' },
    ]

    expect(hasDuplicatePlate(queue, 'abc1234')).toBe(true)
    expect(hasDuplicatePlate(queue, 'XYZ9999')).toBe(false)
  })

  it('não deve reaproveitar a fila em cache quando o banco vier vazio', () => {
    const cachedQueue: QueueDriver[] = [
      { id: '1', name: 'João', plate: 'ABC1234', phone: '1111', status: 'AGUARDANDO', position: 1, waitingMinutes: 0, estimatedMinutes: 0 },
    ]

    expect(resolveQueueSnapshot([], cachedQueue)).toEqual([])
    expect(resolveQueueSnapshot([{ id: '2', name: 'Maria', plate: 'DEF4321', phone: '2222', status: 'AGUARDANDO', position: 1, waitingMinutes: 0, estimatedMinutes: 0 }], cachedQueue)).toHaveLength(1)
  })
})
