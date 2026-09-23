import { supabase } from './supabase'
import type { Driver, QueueStatus } from '../types/queue'

const demoQueue: Driver[] = []
export const defaultDriverPassword = 'Fila1234'

async function hashPassword(password: string) {
  const bytes = new TextEncoder().encode(password)
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function registerDriverAccount(name: string, plate: string, phone: string) {
  if (!supabase) return { ok: false, message: 'Banco não configurado.' }

  const normalizedPlate = plate.trim().toUpperCase()
  const { data: existingDriver, error: existingError } = await supabase
    .from('drivers')
    .select('id')
    .ilike('plate', normalizedPlate)
    .maybeSingle()

  if (existingError) throw existingError
  if (existingDriver) return { ok: false, message: 'Já existe um cadastro com esta placa.' }

  const { error } = await supabase.from('drivers').insert({
    name: name.trim().toUpperCase(),
    plate: normalizedPlate,
    phone: phone.trim(),
    password_hash: await hashPassword(defaultDriverPassword),
    must_change_password: true,
  })

  if (error?.code === 'PGRST204' && error.message.includes('password_hash')) {
    throw new Error('Execute a migração de senha do motorista no Supabase antes de cadastrar novos acessos.')
  }
  if (error) throw error

  return { ok: true, message: `Cadastro criado. A senha inicial é ${defaultDriverPassword}.` }
}

export async function getQueueData() {
  if (!supabase) return demoQueue

  const { data, error } = await supabase
    .from('queue_entries')
    .select('*, driver:drivers(name, plate, phone, carrier, truck_type)')
    .not('status', 'in', '(CARREGADO,CANCELADO,AUSENTE)')
    .order('position', { ascending: true })

  if (error) {
    const fallbackWithTruckType = await supabase
      .from('queue_entries')
      .select('*, driver:drivers(name, plate, phone, carrier, truck_type)')
      .not('status', 'in', '(CARREGADO,CANCELADO,AUSENTE)')
      .order('position', { ascending: true })

    if (!fallbackWithTruckType.error) return mapQueueEntries(fallbackWithTruckType.data ?? [])

    const legacyFallback = await supabase
      .from('queue_entries')
      .select('*, driver:drivers(name, plate, phone, carrier)')
      .not('status', 'in', '(CARREGADO,CANCELADO,AUSENTE)')
      .order('position', { ascending: true })

    if (legacyFallback.error) throw legacyFallback.error
    return mapQueueEntries(legacyFallback.data ?? [])
  }
  if (!data) return []

  return mapQueueEntries(data)
}

function mapQueueEntries(entries: any[]) {
  return entries
    .slice()
    .sort((first: any, second: any) => (first.position ?? 0) - (second.position ?? 0) || String(first.joined_at ?? '').localeCompare(String(second.joined_at ?? '')))
    .map((entry: any, index: number) => ({
    id: String(entry.driver_id ?? entry.id),
    name: entry.driver?.name ?? 'Motorista',
    plate: entry.driver?.plate ?? 'SEM PLACA',
    phone: entry.driver?.phone ?? '(00) 00000-0000',
    company: entry.driver?.carrier ?? entry.driver?.company,
    truckType: entry.driver?.truck_type,
    status: (entry.status ?? 'AGUARDANDO') as QueueStatus,
    position: index + 1,
    waitingMinutes: Number(entry.estimated_wait_minutes ?? 0),
    estimatedMinutes: Number(entry.estimated_wait_minutes ?? 0),
    joinedAt: entry.joined_at,
    }))
}

async function normalizeQueuePositions(queueId: string) {
  if (!supabase) return

  const activeStatuses = ['AGUARDANDO', 'PRÓXIMO', 'CHAMADO', 'EM_CARREGAMENTO']
  const { data: entries, error } = await supabase
    .from('queue_entries')
    .select('id')
    .eq('queue_id', queueId)
    .in('status', activeStatuses)
    .order('position', { ascending: true })
    .order('joined_at', { ascending: true })

  if (error) throw error

  for (const [index, entry] of (entries ?? []).entries()) {
    const { error: updateError } = await supabase
      .from('queue_entries')
      .update({ position: index + 1, updated_at: new Date().toISOString() })
      .eq('id', entry.id)

    if (updateError) throw updateError
  }
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
    const driverPayload = {
      name: driver.name,
      plate: driver.plate,
      phone: driver.phone,
      carrier: driver.company,
      truck_type: driver.truckType,
    }
    let { data: createdDriver, error: driverError } = await supabase.from('drivers').insert(driverPayload).select('id').single()

    if (driverError?.code === 'PGRST204' && driverError.message.includes("'truck_type'")) {
      if (driver.truckType) {
        throw new Error('O banco ainda não possui a coluna truck_type. Execute o comando de migração do Supabase antes de cadastrar o tipo de caminhão.')
      }

      const { truck_type: _truckType, ...legacyPayload } = driverPayload
      const retry = await supabase.from('drivers').insert(legacyPayload).select('id').single()
      createdDriver = retry.data
      driverError = retry.error
    }

    if (driverError) throw driverError
    driverData = createdDriver
  }

  if (!driverData) throw new Error('Não foi possível localizar o motorista.')

  if (driver.truckType && existingDriver) {
    const { data: updatedDriver, error: updateDriverError } = await supabase
      .from('drivers')
      .update({ truck_type: driver.truckType })
      .eq('id', driverData.id)
      .select('id, truck_type')
      .maybeSingle()

    if (updateDriverError?.code === 'PGRST204') {
      throw new Error('O banco ainda não possui a coluna truck_type. Execute o comando de migração do Supabase antes de cadastrar o tipo de caminhão.')
    }
    if (updateDriverError) throw updateDriverError
    if (!updatedDriver?.truck_type) throw new Error('Não foi possível salvar o tipo de caminhão no banco.')
  }

  const { data: queueData, error: queueError } = await supabase
    .from('queues')
    .select('id')
    .order('created_at', { ascending: true })
    .limit(1)
    .single()

  if (queueError) throw queueError
  if (!queueData) throw new Error('Nenhuma fila configurada no Supabase.')

  const { data: activeEntry, error: activeEntryError } = await supabase
    .from('queue_entries')
    .select('id')
    .eq('queue_id', queueData.id)
    .eq('driver_id', driverData.id)
    .in('status', ['AGUARDANDO', 'PRÓXIMO', 'CHAMADO', 'EM_CARREGAMENTO'])
    .limit(1)
    .maybeSingle()

  if (activeEntryError) throw activeEntryError
  if (activeEntry) throw new Error('Já existe um motorista com esta placa na fila.')

  await normalizeQueuePositions(queueData.id)

  const { count: activeCount, error: activeCountError } = await supabase
    .from('queue_entries')
    .select('id', { count: 'exact', head: true })
    .eq('queue_id', queueData.id)
    .in('status', ['AGUARDANDO', 'PRÓXIMO', 'CHAMADO', 'EM_CARREGAMENTO'])

  if (activeCountError) throw activeCountError

  const item = {
    driver_id: driverData.id,
    queue_id: queueData.id,
    status: 'AGUARDANDO',
    position: (activeCount ?? 0) + 1,
    joined_at: new Date().toISOString(),
    estimated_wait_minutes: driver.estimatedMinutes,
  }

  const { error } = await supabase.from('queue_entries').insert(item)

  if (error) throw error
  await normalizeQueuePositions(queueData.id)

  return driver
}

export async function removeDriverFromQueue(plate: string) {
  if (!supabase) return

  const { data: driver, error: driverError } = await supabase
    .from('drivers')
    .select('id')
    .ilike('plate', plate)
    .single()

  if (driverError) throw driverError

  const activeStatuses = ['AGUARDANDO', 'PRÓXIMO', 'CHAMADO', 'EM_CARREGAMENTO']
  const { data: activeEntries, error: activeEntriesError } = await supabase
    .from('queue_entries')
    .select('id, queue_id, position')
    .eq('driver_id', driver.id)
    .in('status', activeStatuses)
    .order('joined_at', { ascending: false })

  if (activeEntriesError) throw activeEntriesError
  const entry = activeEntries?.[0]
  if (!entry) throw new Error('Motorista não está em uma fila ativa.')

  const { error } = await supabase
    .from('queue_entries')
    .update({ status: 'CANCELADO', updated_at: new Date().toISOString() })
    .eq('id', entry.id)

  if (error) throw error

  await normalizeQueuePositions(entry.queue_id)
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

  const { data: queueEntry } = await supabase
    .from('queue_entries')
    .select('queue_id')
    .eq('driver_id', driver.id)
    .order('joined_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (queueEntry) await normalizeQueuePositions(queueEntry.queue_id)
}

export async function callNextDriver() {
  if (!supabase) {
    return
  }

  const { error } = await supabase.rpc('call_next_driver')

  if (error) throw error

  const { data: queueData, error: queueError } = await supabase
    .from('queues')
    .select('id')
    .order('created_at', { ascending: true })
    .limit(1)
    .single()

  if (queueError) throw queueError
  await normalizeQueuePositions(queueData.id)
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

export async function signInDriver(plate: string, password: string) {
  if (!supabase) return { ok: false, message: 'Banco não configurado.' as const }

  const { data: driver, error: driverError } = await supabase
    .from('drivers')
    .select('id, name, plate, phone, carrier, truck_type, password_hash, must_change_password')
    .ilike('plate', plate.trim().toUpperCase())
    .maybeSingle()

  if (driverError) throw driverError
  if (!driver) return { ok: false, message: 'Placa não encontrada.' as const }

  if (!driver.password_hash || driver.password_hash !== await hashPassword(password)) {
    return { ok: false, message: 'Senha inválida.' as const }
  }

  const driverInfo: Driver = {
    id: driver.id,
    name: driver.name,
    plate: driver.plate,
    phone: driver.phone,
    company: driver.carrier,
    truckType: driver.truck_type,
    status: 'AGUARDANDO',
    position: 0,
    waitingMinutes: 0,
    estimatedMinutes: 0,
  }

  if (driver.must_change_password) {
    return { ok: true, mustChangePassword: true, message: 'Troque sua senha para continuar.', driver: driverInfo }
  }

  const { data: entry, error: entryError } = await supabase
    .from('queue_entries')
    .select('id, position, status, joined_at, estimated_wait_minutes')
    .eq('driver_id', driver.id)
    .in('status', ['AGUARDANDO', 'PRÓXIMO', 'CHAMADO', 'EM_CARREGAMENTO'])
    .order('joined_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (entryError) throw entryError
  if (!entry) {
    return {
      ok: true,
      message: 'Motorista autenticado. Você pode entrar novamente na fila.',
      driver: driverInfo,
    }
  }

  return {
    ok: true,
    message: 'Motorista autenticado com sucesso.',
    driver: {
      ...driverInfo,
      status: entry.status as QueueStatus,
      position: entry.position,
      waitingMinutes: Number(entry.estimated_wait_minutes ?? 0),
      estimatedMinutes: Number(entry.estimated_wait_minutes ?? 0),
      joinedAt: entry.joined_at,
    } satisfies Driver,
  }
}

export async function changeDriverPassword(driverId: string, password: string) {
  if (!supabase) return { ok: false, message: 'Banco não configurado.' }
  const { data, error } = await supabase
    .from('drivers')
    .update({ password_hash: await hashPassword(password), must_change_password: false })
    .eq('id', driverId)
    .select('id, must_change_password')
    .maybeSingle()
  if (error) throw error
  if (!data || data.must_change_password) throw new Error('A senha não foi gravada. Verifique a política de atualização da tabela drivers no Supabase.')
  return { ok: true, message: 'Senha alterada com sucesso.' }
}
