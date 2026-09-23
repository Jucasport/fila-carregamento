export type QueueStatus =
  | 'AGUARDANDO'
  | 'PRÓXIMO'
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
  truckType?: string
  status: QueueStatus
  position: number
  waitingMinutes: number
  estimatedMinutes: number
  joinedAt?: string
}

export type QueueEntry = {
  id: string
  driver_id: string
  position: number
  status: QueueStatus
  joined_at: string
  called_at?: string
  loading_started_at?: string
  loading_finished_at?: string
  estimated_wait_minutes?: number
}
