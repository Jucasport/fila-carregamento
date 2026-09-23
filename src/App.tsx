import { AlertTriangle, CheckCircle2, Clock3, Gauge, MapPinned, MessageCircle, Phone, RefreshCw, ShieldCheck, Trash2, Truck, User } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useQueue } from './hooks/useQueue'
import { changeDriverPassword, defaultDriverPassword, registerDriverAccount, signInAdmin, signInDriver } from './lib/queueService'
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

function phoneDigits(value: string) {
  return value.replace(/\D/g, '')
}

function whatsappDigits(value: string) {
  const digits = phoneDigits(value)
  return digits.startsWith('55') ? digits : `55${digits.replace(/^0/, '')}`
}

function App() {
  const { drivers, addDriver, callNext, removeDriver, refreshQueue, loading, errorMessage } = useQueue()
  const [accessMode, setAccessMode] = useState<'driver' | 'admin'>('driver')
  const [driverAccessView, setDriverAccessView] = useState<'register' | 'login'>('register')
  const [name, setName] = useState('')
  const [plate, setPlate] = useState('')
  const [phone, setPhone] = useState('')
  const [truckType, setTruckType] = useState('')
  const [driverLoginPlate, setDriverLoginPlate] = useState('')
  const [driverLoginPhone, setDriverLoginPhone] = useState('')
  const [driverLoginPassword, setDriverLoginPassword] = useState('')
  const [newDriverPassword, setNewDriverPassword] = useState('')
  const [confirmDriverPassword, setConfirmDriverPassword] = useState('')
  const [driverLoggedIn, setDriverLoggedIn] = useState(false)
  const [mustChangePassword, setMustChangePassword] = useState(false)
  const [driverMessage, setDriverMessage] = useState('')
  const [joinedDriver, setJoinedDriver] = useState<Driver | null>(null)
  const [adminEmail, setAdminEmail] = useState('admin@fila.com')
  const [adminPassword, setAdminPassword] = useState('')
  const [adminLoggedIn, setAdminLoggedIn] = useState(false)
  const [adminMessage, setAdminMessage] = useState('')
  const [entryMessage, setEntryMessage] = useState('')

  const currentDriver = driverLoggedIn ? joinedDriver : null

  const handleDriverRegistration = async () => {
    const missingFields = [
      !name.trim() ? 'nome do motorista' : '',
      !plate.trim() ? 'placa do caminhão' : '',
      !phone.trim() ? 'telefone' : '',
    ].filter(Boolean)

    if (missingFields.length > 0) {
      setEntryMessage(`Preencha os campos obrigatórios: ${missingFields.join(', ')}.`)
      return
    }

    try {
      const result = await registerDriverAccount(name, plate, phone)
      setEntryMessage(result.message)
      if (result.ok) {
        setDriverLoginPlate(plate.trim().toUpperCase())
        setDriverLoginPhone(phone.trim())
        setDriverLoginPassword(defaultDriverPassword)
        setDriverAccessView('login')
        setName('')
        setPlate('')
        setPhone('')
      }
    } catch (error) {
      setEntryMessage(error instanceof Error ? error.message : 'Não foi possível cadastrar o motorista.')
    }
  }

  const queueStats = useMemo(() => {
    const waiting = drivers.filter((driver) => driver.status === 'AGUARDANDO').length
    const next = drivers.filter((driver) => driver.status === 'PRÓXIMO').length
    const inLoading = drivers.filter((driver) => driver.status === 'EM_CARREGAMENTO').length
    const totalAwaiting = drivers.length

    return { waiting, next, inLoading, totalAwaiting }
  }, [drivers])

  const handleJoinQueue = async () => {
    if (!currentDriver) {
      setEntryMessage('Faça o login do motorista antes de entrar na fila.')
      return
    }

    const newDriver: Driver = {
      ...currentDriver,
      truckType: truckType.trim() || undefined,
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
    setTruckType('')
  }

  const handleDriverLogin = async () => {
    if (!driverLoginPlate.trim() || !driverLoginPhone.trim()) {
      setDriverMessage('Informe a placa e o telefone cadastrados.')
      return
    }

    try {
      const result = await signInDriver(driverLoginPlate, driverLoginPhone, driverLoginPassword)
      if (!result.ok || !result.driver) {
        setDriverMessage(result.message)
        return
      }

      setJoinedDriver(result.driver)
      setDriverLoggedIn(true)
      setMustChangePassword(Boolean(result.mustChangePassword))
      setDriverMessage(result.message)
      localStorage.setItem('fila-carregamento:driver-plate', result.driver.plate)
    } catch (error) {
      setDriverMessage(error instanceof Error ? error.message : 'Não foi possível acessar a fila do motorista.')
    }
  }

  const handleChangeDriverPassword = async () => {
    if (!joinedDriver) return
    if (!/^(?=.*[A-Za-z])(?=.*\d).{8}$/.test(newDriverPassword)) {
      setDriverMessage('A nova senha deve ter exatamente 8 caracteres, com letras e números.')
      return
    }
    if (newDriverPassword !== confirmDriverPassword) {
      setDriverMessage('A confirmação da senha não confere.')
      return
    }

    try {
      const result = await changeDriverPassword(joinedDriver.id, newDriverPassword)
      if (!result.ok) {
        setDriverMessage(result.message)
        return
      }
      setMustChangePassword(false)
      setDriverMessage('Senha alterada. Agora você pode visualizar a fila.')
      setNewDriverPassword('')
      setConfirmDriverPassword('')
    } catch (error) {
      setDriverMessage(error instanceof Error ? error.message : 'Não foi possível alterar a senha.')
    }
  }

  const handleDriverLogout = () => {
    setDriverLoggedIn(false)
    setJoinedDriver(null)
    setMustChangePassword(false)
    setDriverMessage('')
    localStorage.removeItem('fila-carregamento:driver-plate')
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
        <div className="access-switch" role="tablist" aria-label="Área de acesso">
          <button className={accessMode === 'driver' ? 'access-tab active' : 'access-tab'} onClick={() => setAccessMode('driver')}>Motorista</button>
          <button className={accessMode === 'admin' ? 'access-tab active' : 'access-tab'} onClick={() => setAccessMode('admin')}>Administrador</button>
        </div>
      </header>

      <main className="layout">
        {accessMode === 'driver' && (!driverLoggedIn || mustChangePassword || currentDriver?.position === 0) ? <section className="card entry-card">
          <div className="section-header">
            <Truck size={22} />
            <h2>{!driverLoggedIn ? (driverAccessView === 'register' ? 'Cadastro do motorista' : 'Login do motorista') : mustChangePassword ? 'Troca obrigatória de senha' : 'Entrar na fila'}</h2>
          </div>

          {!driverLoggedIn && driverAccessView === 'register' ? <>
            <p className="access-help">Faça seu cadastro inicial para criar o acesso.</p>
            <div className="form-grid">
              <label><span>Nome do motorista</span><input value={name} onChange={(event) => setName(event.target.value.toUpperCase())} placeholder="EX: JOÃO SILVA" /></label>
              <label><span>Placa do caminhão</span><input value={plate} onChange={(event) => setPlate(event.target.value.toUpperCase())} placeholder="ABC1D23" /></label>
              <label><span>Telefone</span><input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="(81) 99999-9999" /></label>
            </div>
            <button className="primary-button" onClick={() => void handleDriverRegistration()}>CADASTRAR MOTORISTA</button>
            <button className="text-button" onClick={() => setDriverAccessView('login')}>JÁ TENHO CADASTRO</button>
          </> : null}

          {!driverLoggedIn && driverAccessView === 'login' ? <>
            <div className="form-grid">
              <label><span>Placa cadastrada</span><input value={driverLoginPlate} onChange={(event) => setDriverLoginPlate(event.target.value.toUpperCase())} placeholder="ABC1D23" /></label>
              <label><span>Telefone cadastrado</span><input value={driverLoginPhone} onChange={(event) => setDriverLoginPhone(event.target.value)} placeholder="(81) 99999-9999" /></label>
              <label><span>Senha</span><input type="password" value={driverLoginPassword} onChange={(event) => setDriverLoginPassword(event.target.value)} placeholder={defaultDriverPassword} /></label>
            </div>
            <button className="primary-button" onClick={() => void handleDriverLogin()}>ENTRAR</button>
            <button className="text-button" onClick={() => setDriverAccessView('register')}>CRIAR CADASTRO INICIAL</button>
          </> : null}

          {mustChangePassword ? <div className="form-grid">
            <p className="admin-message">Primeiro acesso: troque a senha padrão antes de visualizar a fila.</p>
            <label><span>Nova senha</span><input type="password" value={newDriverPassword} onChange={(event) => setNewDriverPassword(event.target.value)} placeholder="8 letras e números" /></label>
            <label><span>Confirmar nova senha</span><input type="password" value={confirmDriverPassword} onChange={(event) => setConfirmDriverPassword(event.target.value)} placeholder="REPITA A SENHA" /></label>
            <button className="primary-button" onClick={() => void handleChangeDriverPassword()}>TROCAR SENHA E CONTINUAR</button>
          </div> : null}

          {driverLoggedIn && !mustChangePassword && currentDriver?.position === 0 ? <>
            <p className="access-help">Cadastro para entrar na fila</p>
            <label><span>Tipo de caminhão</span><input value={truckType} onChange={(event) => setTruckType(event.target.value.toUpperCase())} placeholder="EX: CARRETA BAÚ" /></label>
            <button className="primary-button" onClick={() => void handleJoinQueue()}>ENTRAR NA FILA</button>
          </> : null}
          {driverMessage ? <p className="admin-message">{driverMessage}</p> : null}
          {entryMessage ? <p className="admin-message">{entryMessage}</p> : null}
          {errorMessage ? <p className="admin-message">{errorMessage}</p> : null}
        </section> : null}

        {accessMode === 'driver' && driverLoggedIn && !mustChangePassword && currentDriver?.position !== 0 ? <section className="card driver-card">
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
              <strong>{currentDriver?.phone || '—'}</strong>
              {currentDriver?.phone ? (
                <span className="phone-actions">
                  <a className="phone-action" href={`tel:${phoneDigits(currentDriver.phone)}`} title="Ligar para o motorista"><Phone size={14} /> Ligar</a>
                  <a className="phone-action whatsapp-action" href={`https://wa.me/${whatsappDigits(currentDriver.phone)}`} target="_blank" rel="noreferrer" title="Conversar pelo WhatsApp"><MessageCircle size={14} /> WhatsApp</a>
                </span>
              ) : null}
            </div>
            <div>
              <Clock3 size={18} />
              <span>Entrada na fila</span>
              <strong>{formatDateTime(currentDriver?.joinedAt)}</strong>
            </div>
          </div>

          <button className="text-button" onClick={handleDriverLogout}>SAIR DO ACESSO DO MOTORISTA</button>
        </section> : null}

        {(accessMode === 'admin' || (accessMode === 'driver' && driverLoggedIn && !mustChangePassword)) ? <section className="card public-queue-card">
          <div className="section-header">
            <MapPinned size={22} />
            <div>
              <p className="eyebrow">Acompanhamento público</p>
              <h2>Motoristas na fila</h2>
            </div>
            <button className="refresh-button" onClick={() => void refreshQueue()} disabled={loading} title="Atualizar fila com dados do banco">
              <RefreshCw size={17} className={loading ? 'spinning' : ''} />
              {loading ? 'ATUALIZANDO' : 'ATUALIZAR'}
            </button>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>POS</th>
                  <th>NOME</th>
                  <th>PLACA</th>
                  <th>TELEFONE</th>
                </tr>
              </thead>
              <tbody>
                {drivers.length > 0 ? drivers.map((driver) => (
                  <tr key={`public-${driver.id}`}>
                    <td><strong>{driver.position}</strong></td>
                    <td>{driver.name}</td>
                    <td>{driver.plate}</td>
                    <td>
                      <strong className="phone-link">{driver.phone}</strong>
                      <span className="phone-actions">
                        <a className="phone-action" href={`tel:${phoneDigits(driver.phone)}`} title="Ligar para o motorista"><Phone size={13} /> Ligar</a>
                        <a className="phone-action whatsapp-action" href={`https://wa.me/${whatsappDigits(driver.phone)}`} target="_blank" rel="noreferrer" title="Conversar pelo WhatsApp"><MessageCircle size={13} /> WhatsApp</a>
                      </span>
                      <small className="truck-type">{driver.truckType || 'Tipo não informado'}</small>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={4}>Nenhum motorista na fila.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section> : null}

        {accessMode === 'admin' ? <section className="card admin-card">
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
                  <input type="password" autoComplete="new-password" value={adminPassword} onChange={(event) => setAdminPassword(event.target.value)} placeholder="DIGITE SUA SENHA" />
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
                      <th>AÇÃO</th>
                    </tr>
                  </thead>
                  <tbody>
                    {drivers.map((driver) => (
                      <tr key={driver.id}>
                        <td>{driver.position}</td>
                        <td>{driver.name}</td>
                        <td>{formatDateTime(driver.joinedAt)}</td>
                        <td>{driver.plate}</td>
                        <td>
                          <strong className="phone-link">{driver.phone}</strong>
                          <span className="phone-actions">
                            <a className="phone-action" href={`tel:${phoneDigits(driver.phone)}`} title="Ligar para o motorista"><Phone size={13} /> Ligar</a>
                            <a className="phone-action whatsapp-action" href={`https://wa.me/${whatsappDigits(driver.phone)}`} target="_blank" rel="noreferrer" title="Conversar pelo WhatsApp"><MessageCircle size={13} /> WhatsApp</a>
                          </span>
                          <small className="truck-type">{driver.truckType || 'Tipo não informado'}</small>
                        </td>
                        <td>{formatMinutes(driver.waitingMinutes)}</td>
                        <td>
                          <button
                            className="remove-button"
                            onClick={() => {
                              if (window.confirm(`Remover ${driver.name} da fila?`)) void removeDriver(driver.plate)
                            }}
                            title="Remover motorista da fila"
                          >
                            <Trash2 size={16} /> REMOVER
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section> : null}
      </main>
    </div>
  )
}

export default App
