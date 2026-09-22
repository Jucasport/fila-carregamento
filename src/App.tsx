import { AlertTriangle, CheckCircle, CheckCircle2, Clock3, Gauge, MapPinned, Phone, ShieldCheck, Truck, User } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useEffect, useMemo, useState } from 'react'
import { useQueue } from './hooks/useQueue'
import { signInAdmin } from './lib/queueService'
import type { Driver } from './types/queue'
import './App.css'

function formatMinutes(totalMinutes: number) {
  if (totalMinutes < 60) return `${totalMinutes}min`
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${String(hours).padStart(2, '0')}h${String(minutes).padStart(2, '0')}min`
}

function formatDateTime(value?: string) {
  if (!value) return 'Não informado'
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
}

function App() {
  const { drivers, addDriver, callNext, markLoaded, errorMessage } = useQueue()
  const [name, setName] = useState('')
  const [plate, setPlate] = useState('')
  const [phone, setPhone] = useState('')
  const [carrier, setCarrier] = useState('')
  const [joinedDriver, setJoinedDriver] = useState<Driver | null>(null)
  const [adminEmail, setAdminEmail] = useState('admin@fila.com')
  const [adminPassword, setAdminPassword] = useState('admin123')
  const [adminLoggedIn, setAdminLoggedIn] = useState(false)
  const [adminMessage, setAdminMessage] = useState('')
  const [entryMessage, setEntryMessage] = useState('')

  const currentDriver = joinedDriver ?? drivers[0]

  useEffect(() => {
    if (joinedDriver || drivers.length === 0) return

    const savedPlate = localStorage.getItem('fila-carregamento:driver-plate')
    const savedDriver = savedPlate
      ? drivers.find((driver) => driver.plate.toUpperCase() === savedPlate.toUpperCase())
      : undefined

    setJoinedDriver(savedDriver ?? drivers[0])
  }, [drivers, joinedDriver])

  const queueStats = useMemo(() => {
    const waiting = drivers.filter((driver) => driver.status === 'AGUARDANDO').length
    const next = drivers.filter((driver) => driver.status === 'PRÓXIMO').length
    const inLoading = drivers.filter((driver) => driver.status === 'EM_CARREGAMENTO').length
    const totalAwaiting = drivers.length

    return { waiting, next, inLoading, totalAwaiting }
  }, [drivers])

  const handleJoinQueue = async () => {
    const missingFields = [
      !name.trim() ? 'nome do motorista' : '',
      !plate.trim() ? 'placa do caminhão' : '',
      !phone.trim() ? 'telefone' : '',
    ].filter(Boolean)

    if (missingFields.length > 0) {
      setEntryMessage(`Preencha os campos obrigatórios: ${missingFields.join(', ')}.`)
      return
    }

    const normalizedPlate = plate.trim().toUpperCase()
    const normalizedName = name.trim().toUpperCase()
    const existingByPlate = drivers.find((driver) => driver.plate.toUpperCase() === normalizedPlate)
    const existingByName = drivers.find((driver) => driver.name.trim().toUpperCase() === normalizedName)

    if (existingByPlate || existingByName) {
      const duplicateFields = [
        existingByName ? 'nome' : '',
        existingByPlate ? 'placa' : '',
      ].filter(Boolean)
      setEntryMessage(`Já existe um motorista com este ${duplicateFields.join(' e ')} na fila.`)
      setJoinedDriver(existingByPlate ?? existingByName ?? null)
      localStorage.setItem('fila-carregamento:driver-plate', (existingByPlate ?? existingByName)?.plate ?? normalizedPlate)
      return
    }

    const newDriver: Driver = {
      id: `driver-${Date.now()}`,
      name: name.trim(),
      plate: normalizedPlate,
      phone: phone.trim(),
      company: carrier.trim() || undefined,
      status: 'AGUARDANDO',
      position: drivers.length + 1,
      waitingMinutes: 0,
      estimatedMinutes: drivers.length * 30,
      joinedAt: new Date().toISOString(),
    }

    const added = await addDriver(newDriver)
    if (!added) return

    setEntryMessage('Motorista adicionado à fila com sucesso.')
    setJoinedDriver(newDriver)
    localStorage.setItem('fila-carregamento:driver-plate', newDriver.plate)
    setName('')
    setPlate('')
    setPhone('')
    setCarrier('')
  }

  const handleNext = async () => {
    await callNext()
  }

  const handleAdminLogin = async () => {
    if (!adminEmail.trim() || !adminPassword.trim()) {
      setAdminMessage('Informe e-mail e senha para acessar o painel.')
      return
    }

    const result = await signInAdmin(adminEmail, adminPassword)

    if (!result.ok) {
      setAdminMessage(result.message)
      return
    }

    setAdminLoggedIn(true)
    setAdminMessage(result.message)
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Logística</p>
          <h1>Fila de Carregamento</h1>
        </div>
        <div className="badge">PWA / Mobile</div>
      </header>

      <main className="layout">
        <section className="card entry-card">
          <div className="section-header">
            <Truck size={22} />
            <h2>Entrar na fila</h2>
          </div>

          <div className="form-grid">
            <label>
              <span>Nome do motorista</span>
              <input required value={name} onChange={(event) => setName(event.target.value.toUpperCase())} placeholder="EX: JOÃO SILVA" />
            </label>

            <label>
              <span>Placa do caminhão</span>
              <input required value={plate} onChange={(event) => setPlate(event.target.value.toUpperCase())} placeholder="ABC1D23" />
            </label>

            <label>
              <span>Telefone</span>
              <input required value={phone} onChange={(event) => setPhone(event.target.value.toUpperCase())} placeholder="(81) 99999-9999" />
            </label>

            <label>
              <span>Transportadora</span>
              <input value={carrier} onChange={(event) => setCarrier(event.target.value.toUpperCase())} placeholder="OPCIONAL" />
            </label>
          </div>

          <button className="primary-button" onClick={handleJoinQueue}>
            ENTRAR NA FILA
          </button>
          {entryMessage ? <p className="admin-message">{entryMessage}</p> : null}
          {errorMessage ? <p className="admin-message">{errorMessage}</p> : null}
        </section>

        <section className="card driver-card">
          <div className="driver-header">
            <div>
              <p className="eyebrow accent">Olá, {currentDriver?.name || 'motorista'}</p>
              <h2>Sua posição</h2>
            </div>
            <div className="position-box">#{currentDriver?.position || 0}</div>
          </div>

          <div className="stats-grid">
            <div className="stat-box">
              <MapPinned size={18} />
              <span>Posição</span>
              <strong>{currentDriver?.position || 0}º</strong>
            </div>
            <div className="stat-box">
              <Gauge size={18} />
              <span>À sua frente</span>
              <strong>{Math.max((currentDriver?.position ?? 1) - 1, 0)}</strong>
            </div>
            <div className="stat-box">
              <Clock3 size={18} />
              <span>Tempo aguardando</span>
              <strong>{formatMinutes(currentDriver?.waitingMinutes || 0)}</strong>
            </div>
            <div className="stat-box">
              <AlertTriangle size={18} />
              <span>Previsão</span>
              <strong>{formatMinutes(currentDriver?.estimatedMinutes || 0)}</strong>
            </div>
          </div>

          <div className="status-pill status-awaiting">🟡 AGUARDANDO</div>

          <div className="mini-grid">
            <div>
              <User size={18} />
              <span>Motorista</span>
              <strong>{currentDriver?.name || '—'}</strong>
            </div>
            <div>
              <Truck size={18} />
              <span>Placa</span>
              <strong>{currentDriver?.plate || '—'}</strong>
            </div>
            <div>
              <Phone size={18} />
              <span>Telefone</span>
              <strong><a href={currentDriver?.phone ? `tel:${currentDriver.phone.replace(/\D/g, '')}` : undefined}>{currentDriver?.phone || '—'}</a></strong>
            </div>
            <div>
              <Clock3 size={18} />
              <span>Entrada na fila</span>
              <strong>{formatDateTime(currentDriver?.joinedAt)}</strong>
            </div>
          </div>

          {currentDriver && !['CARREGADO', 'CANCELADO', 'AUSENTE'].includes(currentDriver.status) ? (
            <button className="secondary-button" onClick={() => void markLoaded(currentDriver.plate)}>
              <CheckCircle size={18} /> MARCAR COMO CARREGADO
            </button>
          ) : null}

          <div className="qr-box">
            <QRCodeSVG value={currentDriver ? `fila-carregamento://driver/${currentDriver.id}` : 'fila-carregamento://home'} size={120} />
            <div>
              <p className="eyebrow">Código de acesso</p>
              <strong>{currentDriver ? `#${String(currentDriver.position).padStart(3, '0')}` : '#000'}</strong>
            </div>
          </div>
        </section>

        <section className="card admin-card">
          {!adminLoggedIn ? (
            <>
              <div className="section-header">
                <ShieldCheck size={22} />
                <h2>Login administrativo</h2>
              </div>

              <div className="form-grid compact">
                <label>
                  <span>E-mail do administrador</span>
                  <input value={adminEmail} onChange={(event) => setAdminEmail(event.target.value)} placeholder="admin@fila.com" />
                </label>

                <label>
                  <span>Senha</span>
                  <input type="password" value={adminPassword} onChange={(event) => setAdminPassword(event.target.value)} placeholder="••••••••" />
                </label>
              </div>

              {adminMessage ? <p className="admin-message">{adminMessage}</p> : null}
              <button className="primary-button" onClick={handleAdminLogin}>ENTRAR COMO ADMIN</button>
            </>
          ) : (
            <>
              <div className="section-header">
                <CheckCircle2 size={22} />
                <h2>Painel administrativo</h2>
                <button className="primary-button small" onClick={handleNext}>CHAMAR PRÓXIMO</button>
              </div>

              <div className="admin-kpis">
                <div className="kpi">
                  <span>Caminhões aguardando</span>
                  <strong>{queueStats.totalAwaiting}</strong>
                </div>
                <div className="kpi">
                  <span>Próximos</span>
                  <strong>{queueStats.next}</strong>
                </div>
                <div className="kpi">
                  <span>Em carregamento</span>
                  <strong>{queueStats.inLoading}</strong>
                </div>
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>POS</th>
                      <th>MOTORISTA</th>
                      <th>ENTRADA</th>
                      <th>PLACA</th>
                      <th>TELEFONE</th>
                      <th>TEMPO</th>
                    </tr>
                  </thead>
                  <tbody>
                    {drivers.map((driver) => (
                      <tr key={driver.id}>
                        <td>{driver.position}</td>
                        <td>{driver.name}</td>
                        <td>{formatDateTime(driver.joinedAt)}</td>
                        <td>{driver.plate}</td>
                        <td><a className="phone-link" href={`tel:${driver.phone.replace(/\D/g, '')}`}>{driver.phone}</a></td>
                        <td>{formatMinutes(driver.waitingMinutes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  )
}

export default App
