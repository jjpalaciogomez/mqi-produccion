import { Fragment, useCallback, useEffect, useState } from 'react'
import { sb, q } from '../supabase.js'
import { Aviso, Cargando, Modal } from '../ui.jsx'
import { hoyCO } from '../cumplimiento.js'
import { TIPOS_VUELTA, cfgDe, zonaDe, zonaTxt, cuandoTxt, h12, recepcionTxt, simular, VEHICULOS, linkMaps, linkWaze, linksRecorrido, telLink, tieneUbic } from '../logistica.js'

// Celular del conductor: la ruta confirmada de hoy, en orden, para marcar cada parada
export default function Conductor({ perfil }) {
  const hoy = hoyCO()
  const [d, setD] = useState(null)
  const [veh, setVeh] = useState(null)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [noSePudo, setNoSePudo] = useState(null)
  const cargar = useCallback(async () => {
    try {
      const [recs, aj] = await Promise.all([
        q(sb.from('recorridos').select('*, vueltas(*)').eq('fecha', hoy).eq('estado', 'confirmada')),
        q(sb.from('ajustes').select('valor').eq('clave', 'logistica')),
      ])
      for (const r of recs) r.vueltas = (r.vueltas || []).filter((v) => v.estado !== 'cancelada').sort((a, b) => (a.orden ?? 99) - (b.orden ?? 99))
      recs.sort((a, b) => Object.keys(VEHICULOS).indexOf(a.vehiculo) - Object.keys(VEHICULOS).indexOf(b.vehiculo) || (a.numero || 1) - (b.numero || 1))
      setD({ recs, planta: aj[0]?.valor || null }); setError('')
    } catch (e) { setError(e.message) }
  }, [hoy])
  useEffect(() => { cargar(); const t = setInterval(cargar, 60000); return () => clearInterval(t) }, [cargar])
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(''), 4000); return () => clearTimeout(t) }, [msg])

  const marcar = async (v, hecha, nota) => {
    try {
      const r = await q(sb.rpc('marcar_vuelta', { p_vuelta: v.id, p_hecha: hecha, p_nota: nota || null }))
      if (r !== 'ok') { setError(r); return false }
      setMsg(hecha ? `${v.destino}: hecha ✓` : `${v.destino}: no se pudo`); cargar(); return true
    } catch (e) { setError(e.message); return false }
  }

  const rec = d?.recs.find((r) => r.id === veh) || d?.recs[0]
  const nombreRec = (r) => `${VEHICULOS[r.vehiculo].split(' (')[0]}${(r.numero || 1) > 1 || d?.recs.some((x) => x.id !== r.id && x.vehiculo === r.vehiculo) ? ` · Ruta ${r.numero || 1}` : ''}`
  const vs = rec?.vueltas || []
  const faltan = vs.filter((v) => v.estado === 'pendiente')
  // Igual que en la ruta: un paso por la planta carga toda la mercancía que ya esté lista
  const sim = d?.planta && tieneUbic(d.planta) && vs.length ? simular(vs, d.planta, { ...cfgDe(d.planta), ...(rec?.salida ? { salida: String(rec.salida).slice(0, 5) } : {}) }, hoy) : null
  const nombresDe = (ids) => ids.map((id) => vs.find((x) => x.id === id)?.destino).filter(Boolean).join(', ')
  const planta = d?.planta && tieneUbic(d.planta) ? d.planta : null
  return (
    <div className="conductor">
      <header className="cond-cab">
        <div><b>Ruta de hoy</b><div className="tenue-claro pequeño">{new Date(hoy + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}</div></div>
        <div className="cond-botones">
          <button className="btn btn-sec btn-sm" onClick={cargar}>Actualizar</button>
          <button className="btn-link claro" onClick={() => sb.auth.signOut()}>Salir</button>
        </div>
      </header>
      {msg && <div className="toast">{msg}</div>}
      <Aviso>{error}</Aviso>
      {!d ? <Cargando /> : d.recs.length === 0 ? (
        <div className="vacio">Todavía no hay una ruta confirmada para hoy. Cuando el administrador la confirme, aparece aquí.</div>
      ) : (
        <>
          {d.recs.length > 1 && (
            <div className="segmentado cond-veh">{d.recs.map((r) => <button key={r.id} className={rec?.id === r.id ? 'sel' : ''} onClick={() => setVeh(r.id)}>{nombreRec(r)}</button>)}</div>
          )}
          <div className="cond-resumen">
            <span><b>{nombreRec(rec)}</b>{rec.salida ? ` · sale ${h12(rec.salida)}` : ''}{rec.conductor ? ` · ${rec.conductor}` : ''}</span>
            <span>{vs.length - faltan.length} de {vs.length} hechas</span>
          </div>
          {faltan.length > 0 && linksRecorrido(faltan, planta).map((l, i, a) => (
            <a key={l} className="btn btn-sec cond-todo" href={l} target="_blank" rel="noreferrer">🗺 Abrir {a.length > 1 ? `tramo ${i + 1}` : 'el recorrido'} en Google Maps</a>
          ))}
          <div className="cond-lista">
            <div className="log-planta-punto sale"><span className="ico">🏭</span><div className="crece"><b>Sale de la planta</b>{sim?.alSalir?.length ? <div className="pequeño">Lleva la mercancía de: {nombresDe(sim.alSalir)}</div> : null}</div></div>
            {vs.map((v, i) => {
              const hecha = v.estado === 'hecha', no = v.estado === 'no_hecha'
              const siguiente = v.id === faltan[0]?.id
              const pasoPlanta = (txt) => (
                <div className={`cond-parada regreso${hecha || no ? ' hecha' : ''}`}>
                  <div className="cond-p-cab"><span className="log-n planta">P</span>
                    <div className="crece"><span className="etq-vuelta regreso">Planta MQI</span><div className="cond-destino">{txt}</div></div></div>
                  {planta && <div className="cond-acc">
                    <a className="btn btn-sec" href={linkMaps(planta)} target="_blank" rel="noreferrer">Maps</a>
                    <a className="btn btn-sec" href={linkWaze(planta)} target="_blank" rel="noreferrer">Waze</a>
                  </div>}
                </div>
              )
              return (<Fragment key={v.id}>
                {v.recoger_planta && (!planta || sim?.pasos[i]?.carga) && pasoPlanta(`Recoger la mercancía para ${nombresDe(sim?.pasos[i]?.carga?.lleva || [v.id])}${v.lista_desde ? ` (lista desde las ${h12(v.lista_desde)})` : ''}`)}
                <div className={`cond-parada ${v.tipo}${hecha ? ' hecha' : ''}${no ? ' no-hecha' : ''}${siguiente ? ' siguiente' : ''}`}>
                  <div className="cond-p-cab">
                    <span className="log-n">{i + 1}</span>
                    <div className="crece">
                      <span className={`etq-vuelta ${v.tipo}`}>{TIPOS_VUELTA[v.tipo]}</span>
                      {v.prioridad === 1 && <span className="badge badge-bad">urgente</span>}
                      {v.hora ? <b className="hora-exacta grande">⏰ {cuandoTxt(v).replace(/^./, (c) => c.toUpperCase())}</b> : cuandoTxt(v) && <span className="etq">{cuandoTxt(v)}</span>}
                      <div className="cond-destino">{v.destino}{zonaTxt(v) && <span className={`zona z-${zonaDe(v)}`}>{zonaTxt(v)}</span>}</div>
                      <div className="cond-dir">{[v.direccion, v.municipio].filter(Boolean).join(', ')}</div>
                    </div>
                  </div>
                  <div className="cond-que">{v.descripcion}{v.op ? ` · OP ${v.op}` : ''}</div>
                  {(v.contacto || v.horario || recepcionTxt(v.recepcion)) && <div className="cond-extra">{v.contacto && <span>👤 {v.contacto}</span>}{recepcionTxt(v.recepcion) && <span>🕒 Recibe {recepcionTxt(v.recepcion)}</span>}{v.horario && <span>{v.horario}</span>}</div>}
                  {hecha && <div className="cond-estado ok">✓ Hecha</div>}
                  {no && <div className="cond-estado mal">No se pudo: {v.resultado}</div>}
                  <div className="cond-acc">
                    <a className="btn btn-sec" href={linkMaps(v)} target="_blank" rel="noreferrer">Maps</a>
                    <a className="btn btn-sec" href={linkWaze(v)} target="_blank" rel="noreferrer">Waze</a>
                    {v.telefono && <a className="btn btn-sec" href={telLink(v.telefono)}>Llamar</a>}
                  </div>
                  {!hecha && !no && (
                    <div className="cond-acc">
                      <button className="btn btn-ok btn-grande" onClick={() => marcar(v, true)}>Hecha</button>
                      <button className="btn btn-sec btn-grande" onClick={() => setNoSePudo(v)}>No se pudo</button>
                    </div>
                  )}
                </div>
                {v.volver_planta && pasoPlanta(`Volver a dejar lo que trae de ${v.destino}${v.volver_antes ? ` · antes de las ${h12(v.volver_antes)}` : ' · lo antes posible'}${sim?.pasos[i]?.vuelve?.lleva?.length ? ` · y recoger la mercancía para ${nombresDe(sim.pasos[i].vuelve.lleva)}` : ''}`)}
              </Fragment>)
            })}
            <div className="log-planta-punto regresa"><span className="ico">🏭</span><div className="crece"><b>Regresa a la planta</b>{sim ? <span> ≈ {h12(String(Math.floor(sim.regreso / 60)).padStart(2, '0') + ':' + String(Math.round(sim.regreso % 60) % 60).padStart(2, '0'))}</span> : null}</div>
              {planta && <a className="btn btn-sec" href={linkMaps(planta)} target="_blank" rel="noreferrer">Maps</a>}</div>
          </div>
        </>
      )}
      {noSePudo && <NoSePudo v={noSePudo} onClose={() => setNoSePudo(null)} onGuardar={async (nota) => { if (await marcar(noSePudo, false, nota)) setNoSePudo(null) }} />}
      <footer className="tablet-pie"><span>MQI Logística</span><span>{perfil?.nombre || ''}</span></footer>
    </div>
  )
}

function NoSePudo({ v, onClose, onGuardar }) {
  const [nota, setNota] = useState('')
  const RAZONES = ['Cerrado', 'No había quién recibiera', 'No estaba listo', 'No alcanzó el tiempo', 'Dirección errada']
  return (
    <Modal titulo={`No se pudo: ${v.destino}`} onClose={onClose}>
      <div className="cond-razones">{RAZONES.map((r) => <button key={r} className={`btn btn-sec${nota === r ? ' sel' : ''}`} onClick={() => setNota(r)}>{r}</button>)}</div>
      <label className="form">¿Qué pasó?<textarea rows={2} value={nota} onChange={(e) => setNota(e.target.value)} /></label>
      <div className="acciones"><button className="btn btn-sec" onClick={onClose}>Cancelar</button><button className="btn" disabled={!nota.trim()} onClick={() => onGuardar(nota.trim())}>Guardar</button></div>
    </Modal>
  )
}
