import { supabase } from './supabase'
import type { Driver, QueueStatus } from '../types/queue'

const demoQueue: Driver[] = []

export async function getQueueData() {
  if (!supabase) return demoQueue

  const { data, error } = await supabase
    .from('queue_entries')
    .select('*, driver:drivers(name, plate, phone, carrier, truck_type)')
    .not('status', 'in', '(CARREGADO,CANCELADO,AUSENTE)')
    .order('position', { ascending: true })

  if (error) {
    const fallback = await supabase
      .from('queue_entries')
      .select('*, driver:drivers(name, plate, phone, carrier)')
      .not('status', 'in', '(CARREGADO,CANCELADO,AUSENTE)')
      .order('position', { ascending: true })

    if (fallback.error) throw fallback.error
    return mapQueueEntries(fallback.data ?? [])
  }
  if (!data) return []

  return mapQueueEntries(data)
}

function mapQueueEntries(entries: any[]) {
  return entries.map((entry: any) => ({
    id: String(entry.driver_id ?? entry.id),
    name: entry.driver?.name ?? 'Motorista',
    plate: entry.driver?.plate ?? 'SEM PLACA',
    phone: entry.driver?.phone ?? '(00) 00000-0000',
    company: entry.driver?.carrier ?? entry.driver?.company,
    truckType: entry.driver?.truck_type,
    status: (entry.status ?? 'AGUARDANDO') as QueueStatus,
    position: entry.position ?? 0,
    waitingMinutes: Number(entry.estimated_wait_minutes ?? 0),
    estimatedMinutes: Number(entry.estimated_wait_minutes ?? 0),
    joinedAt: entry.joined_at,
  }))
}

export async function addDriverToQueue(driver: Driver) {
  if (!supabase) {
    return driver
  }

  const { data: existingDriver, error: findDriverError } = await supabase
    .from('drivers')
    .select('id')
    .ilike('plate', driver.plate)
    .maybeSingle()

  if (findDriverError) throw findDriverError

  let driverData = existingDriver

  if (!driverData) {
    const { data: createdDriver, error: driverError } = await supabase.from('drivers').insert({
      name: driver.name,
      plate: driver.plate,
      phone: driver.phone,
      carrier: driver.company,
      truck_type: driver.truckType,
    }).select('id').single()

    if (driverError) throw driverError
    driverData = createdDriver
  }

  const { data: queueData, error: queueError } = await supabase
    .from('queues')
    .select('id')
    .order('created_at', { ascending: true })
    .limit(1)
    .single()

  if (queueError) throw queueError
  if (!queueData) throw new Error('Nenhuma fila configurada no Supabase.')

  const item = {
    driver_id: driverData.id,
    queue_id: queueData.id,
    status: 'AGUARDANDO',
    position: driver.position,
    joined_at: new Date().toISOString(),
    estimated_wait_minutes: driver.estimatedMinutes,
  }

  const { error } = await supabase.from('queue_entries').insert(item)

  if (error) throw error

  return driver
}

export async function removeDriverFromQueue(plate: string) {
  if (!supabase) return

  const { data: driver, error: driverError } = await supabase
    .from('drivers')
    .select('id')
    .eq('plate', plate)
    .single()

  if (driverError) throw driverError

  const { error } = await supabase.rpc('remove_driver_from_queue', { target_driver_id: driver.id })

  if (error) throw error
}

export async function markDriverLoaded(plate: string) {
  if (!supabase) return

  const { data: driver, error: driverError } = await supabase
    .from('drivers')
    .select('id')
    .eq('plate', plate)
    .single()

  if (driverError) throw driverError

  const { error } = await supabase
    .from('queue_entries')
    .update({
      status: 'CARREGADO',
      loading_finished_at: new Date().toISOString(),
    })
    .eq('driver_id', driver.id)
    .in('status', ['AGUARDANDO', 'PRÓXIMO', 'CHAMADO', 'EM_CARREGAMENTO'])

  if (error) throw error
}

export async function callNextDriver() {
  if (!supabase) {
    return
  }

  const { error } = await supabase.rpc('call_next_driver')

  if (error) throw error
}

export async function signInAdmin(email: string, password: string) {
  if (!supabase) {
    return { ok: true, message: 'Modo demo: painel administrativo liberado localmente.' }
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return { ok: false, message: error.message }
  }

  return { ok: true, message: 'Administrador autenticado com sucesso.' }
}
