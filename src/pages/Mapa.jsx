import { useMemo } from 'react'
import { ReactFlow, Background, Controls, MarkerType } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { fmtFecha, fmtMin, fmtNum } from '../ui.jsx'
import { DIF_NOMBRE, esTerceros, textoMedidas } from '../estandar.js'

// Mapa del proyecto: OP → ítems → productos (con la lista de sus procesos) → ensamble final.
const COLOR = {
  terminada: { bg: '#eaf7ef', borde: '#2f9e5b' },
  en_curso: { bg: '#eaf2fd', borde: '#2f6fd1' },
  lista: { bg: '#ffffff', borde: '#111827' },
  espera: { bg: '#f5f6f8', borde: '#b8bec7' },
}
const ICONO = { terminada: '✓', en_curso: '●', pausada: '●', lista: '○', espera: '·' }
const TXT_EST = { terminada: 'terminado', en_curso: 'en proceso', pausada: 'en proceso', lista: 'listo para empezar', espera: 'en espera' }
const GX = 300, ANCHO = { op: 230, item: 230, comp: 330 }

const estTarea = (t) => (t.estado === 'pendiente' ? (t.bloqueada ? 'espera' : 'lista') : t.estado)

// Estado del bloque según sus pasos
function estBloque(ts) {
  if (ts.length && ts.every((t) => t.estado === 'terminada')) return 'terminada'
  if (ts.some((t) => ['en_curso', 'pausada', 'terminada'].includes(t.estado))) return 'en_curso'
  if (ts.some((t) => estTarea(t) === 'lista')) return 'lista'
  return 'espera'
}

function resumen(ts) {
  const planta = ts.filter((t) => !esTerceros(t))
  const std = planta.reduce((s, t) => s + Number(t.min_std || 0), 0)
  const real = planta.reduce((s, t) => s + Number(t.min_reales || 0), 0)
  const stdHecho = planta.filter((t) => t.estado === 'terminada').reduce((s, t) => s + Number(t.min_std || 0), 0)
  return { std, real, stdHecho, hechos: ts.filter((t) => t.estado === 'terminada').length, total: ts.length }
}

function Tiempo({ real, std, dias }) {
  if (dias) return <span className="mp-t">{real > 0 ? `${fmtNum(real / 1440, 1)} / ` : ''}{fmtNum(std, 0)} d</span>
  const alto = std > 0 && real > std * 1.2
  return <span className={`mp-t${alto ? ' mp-alto' : ''}`}>{real > 0 ? fmtMin(real) : '—'} / {std > 0 ? fmtMin(std) : '—'}</span>
}

function ListaPasos({ ts }) {
  return (
    <ul className="mp-pasos">
      {ts.map((t) => {
        const e = estTarea(t)
        return (
          <li key={t.id} className={`mp-${e}`} title={`${TXT_EST[e]}${t.personas ? ' · ' + t.personas : ''}`}>
            <span className="mp-ic">{ICONO[e]}</span>
            <span className="mp-nom">{t.proceso_nombre}{t.alternativa ? ' (alt.)' : ''}<small>{t.area}{t.personas ? ` · ${t.personas}` : ''}</small></span>
            <Tiempo real={Number(t.min_reales)} std={esTerceros(t) ? Number(t.tiempo_std_unit) : Number(t.min_std)} dias={esTerceros(t)} />
          </li>
        )
      })}
    </ul>
  )
}

export default function Mapa({ orden, items, comps, tareas, productos }) {
  const { nodes, edges } = useMemo(() => {
    const nodes = [], edges = []
    const prod = Object.fromEntries(productos.map((p) => [p.codigo, p]))
    const nodo = (id, x, y, tipo, estado, label) => {
      const c = COLOR[estado] || { bg: '#fff', borde: '#111827' }
      nodes.push({
        id, position: { x, y }, draggable: false, connectable: false, data: { label },
        style: { width: ANCHO[tipo] || 300, background: c.bg, border: `${estado === 'lista' ? 2 : 1.5}px solid ${c.borde}`, borderRadius: 10, padding: 8, textAlign: 'left', ...(tipo === 'op' ? { background: '#000', color: '#fff', border: '2px solid #fbbf24' } : {}) },
        sourcePosition: 'right', targetPosition: 'left',
      })
    }
    const flecha = (a, b) => edges.push({ id: `${a}-${b}`, source: a, target: b, type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 } })
    const alto = (n) => 84 + n * 34

    let y = 0
    const ys = []
    for (const it of items) {
      const cs = comps.filter((c) => c.item_id === it.id)
      const tsItem = tareas.filter((t) => t.item_id === it.id && t.estado !== 'omitida')
      const ens = tsItem.find((t) => !t.componente_id)
      const y0 = y
      let yc = y0
      cs.forEach((c) => {
        const ts = tsItem.filter((t) => t.componente_id === c.id).sort((a, b) => a.paso - b.paso)
        const p = prod[c.producto]
        const r = resumen(ts)
        const sig = ts.find((t) => estTarea(t) === 'lista')
        nodo(`c-${c.id}`, GX * 2, yc, 'comp', estBloque(ts), (
          <div className="mp">
            <div className="mp-cab"><b>{c.producto}</b> {p?.nombre}</div>
            <div className="mp-sub">{textoMedidas(p?.medida, c.ancho, c.profundidad, c.alto) || 'sin medidas'} · {fmtNum(Number(c.cantidad) * Number(it.cantidad), 2)} und · dif. {DIF_NOMBRE[c.dificultad]?.toLowerCase()}</div>
            <ListaPasos ts={ts} />
            <div className="mp-pie">{r.hechos}/{r.total} pasos · real <Tiempo real={r.real} std={r.std} />{sig && <> · sigue: <b>{sig.proceso_nombre?.toLowerCase()}</b></>}</div>
          </div>
        ))
        flecha(`i-${it.id}`, `c-${c.id}`)
        yc += alto(ts.length) + 24
      })
      const altoItem = Math.max(yc - y0 - 24, 90)
      const r = resumen(tsItem)
      const iy = y0 + altoItem / 2 - 50
      nodo(`i-${it.id}`, GX, iy, 'item', estBloque(tsItem), (
        <div className="mp">
          <div className="mp-cab"><b>Ítem {it.numero}</b> · {it.descripcion} × {fmtNum(it.cantidad, 2)}</div>
          <div className="mp-barra"><i style={{ width: `${r.std ? Math.round((100 * r.stdHecho) / r.std) : 0}%` }} /></div>
          <div className="mp-sub">{r.hechos}/{r.total} pasos · {r.std ? Math.round((100 * r.stdHecho) / r.std) : 0}% del estándar</div>
          <div className="mp-sub">Tiempo real <Tiempo real={r.real} std={r.std} /></div>
        </div>
      ))
      if (ens) {
        nodo(`e-${it.id}`, GX * 3 + 60, iy - 10, 'comp', estBloque([ens]), (
          <div className="mp">
            <div className="mp-cab"><b>Ensamble final</b> · {ens.area}</div>
            <div className="mp-sub">dif. {DIF_NOMBRE[ens.dificultad_ensamble]?.toLowerCase()} · {ens.bloqueada ? 'espera que terminen los productos' : TXT_EST[estTarea(ens)]}</div>
            <ListaPasos ts={[ens]} />
          </div>
        ))
        cs.forEach((c) => flecha(`c-${c.id}`, `e-${it.id}`))
      }
      ys.push(iy)
      y = y0 + altoItem + 60
    }
    const r = resumen(tareas.filter((t) => t.estado !== 'omitida'))
    const oy = ys.length ? (ys[0] + ys[ys.length - 1]) / 2 : 0
    nodo('op', 0, oy, 'op', 'op', (
      <div className="mp">
        <div className="mp-cab"><b>OP {orden.numero}</b></div>
        <div className="mp-sub">{orden.cliente}</div>
        <div className="mp-sub">Entrega {fmtFecha(orden.fecha_compromiso)} · avance {orden.avance_pct}%</div>
        <div className="mp-sub">Real {fmtMin(r.real)} de {fmtMin(r.std)} estándar</div>
      </div>
    ))
    items.forEach((it) => flecha('op', `i-${it.id}`))
    return { nodes, edges }
  }, [orden, items, comps, tareas, productos])

  if (items.length === 0) return <div className="vacio">Agrega ítems y productos para ver el mapa.</div>
  return (
    <div>
      <div className="leyenda">
        <span><i style={{ background: COLOR.lista.bg, borderColor: COLOR.lista.borde }} />○ Listo para empezar</span>
        <span><i style={{ background: COLOR.en_curso.bg, borderColor: COLOR.en_curso.borde }} />● En proceso</span>
        <span><i style={{ background: COLOR.terminada.bg, borderColor: COLOR.terminada.borde }} />✓ Terminado</span>
        <span><i style={{ background: COLOR.espera.bg, borderColor: COLOR.espera.borde }} />· En espera</span>
        <span className="tenue">Tiempos: real / estándar. En rojo, 20% o más por encima del estándar.</span>
      </div>
      <div className="mapa">
        <ReactFlow nodes={nodes} edges={edges} fitView minZoom={0.15} nodesDraggable={false} nodesConnectable={false}>
          <Background gap={24} size={1} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </div>
  )
}
