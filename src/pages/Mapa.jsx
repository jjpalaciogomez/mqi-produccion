import { textoMedidas } from '../estandar.js'
import { useMemo } from 'react'
import { ReactFlow, Background, Controls, MarkerType } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { fmtFecha, fmtNum } from '../ui.jsx'

// Colores por estado de cada paso
const COLOR = {
  terminada: { bg: '#e3f4ea', borde: '#2f9e5b' },
  en_curso: { bg: '#e4effc', borde: '#2f6fd1' },
  pausada: { bg: '#fdf3dc', borde: '#d49a16' },
  lista: { bg: '#ffffff', borde: '#1f2a37' },
  espera: { bg: '#f3f4f6', borde: '#b8bec7' },
}
const W = 190, H = 64, GX = 230, GY = 90

export default function Mapa({ orden, items, comps, tareas, productos }) {
  const { nodes, edges } = useMemo(() => {
    const nodes = [], edges = []
    const prod = Object.fromEntries(productos.map((p) => [p.codigo, p]))
    const est = (t) => (t.estado === 'pendiente' ? (t.bloqueada ? 'espera' : 'lista') : t.estado)
    const caja = (id, x, y, titulo, sub, tipo, extra = {}) => {
      const c = COLOR[tipo] || { bg: '#fff', borde: '#1f2a37' }
      nodes.push({
        id, position: { x, y }, draggable: false, connectable: false,
        data: { label: <div className="nodo"><b>{titulo}</b><span>{sub}</span></div> },
        style: { width: W, minHeight: H, background: c.bg, border: `${tipo === 'lista' ? 2 : 1.5}px solid ${c.borde}`, borderRadius: 10, padding: 6, ...extra },
        sourcePosition: 'right', targetPosition: 'left',
      })
    }
    const flecha = (a, b, punteada) => edges.push({
      id: `${a}-${b}`, source: a, target: b, type: 'smoothstep',
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
      style: punteada ? { strokeDasharray: '4 4' } : undefined,
    })

    let y = 0
    const filasItem = []
    for (const it of items) {
      const cs = comps.filter((c) => c.item_id === it.id)
      const y0 = y
      let maxPasos = 0
      cs.forEach((c, i) => {
        const ts = tareas.filter((t) => t.componente_id === c.id && t.estado !== 'omitida').sort((a, b) => a.paso - b.paso)
        maxPasos = Math.max(maxPasos, ts.length)
        const cy = y0 + i * GY
        caja(`c-${c.id}`, GX * 2, cy, c.producto, `${prod[c.producto]?.nombre || ''}${textoMedidas(prod[c.producto]?.medida, c.ancho, c.profundidad, c.alto) ? ' · ' + textoMedidas(prod[c.producto]?.medida, c.ancho, c.profundidad, c.alto) : ''}`, 'comp',
          { background: '#f8f9fb', border: '1px dashed #8a93a0' })
        flecha(`i-${it.id}`, `c-${c.id}`)
        let prev = `c-${c.id}`
        ts.forEach((t, k) => {
          const nid = `t-${t.id}`
          caja(nid, GX * (3 + k), cy, t.area, `${fmtNum(t.cantidad, 2)} und · ${etiqueta(est(t))}`, est(t))
          flecha(prev, nid, k === 0)
          prev = nid
        })
        c._ultimo = prev
      })
      const alto = Math.max(1, cs.length)
      const iy = y0 + ((alto - 1) * GY) / 2
      caja(`i-${it.id}`, GX, iy, `Ítem ${it.numero}`, `${it.descripcion} × ${fmtNum(it.cantidad, 2)}`, 'item',
        { background: '#1f2a37', color: '#fff', border: '1px solid #1f2a37' })
      const ens = tareas.find((t) => t.item_id === it.id && !t.componente_id)
      if (ens) {
        const nid = `t-${ens.id}`
        caja(nid, GX * (3 + maxPasos), iy, 'Ensamble final', `${ens.area} · ${etiqueta(est(ens))}`, est(ens))
        cs.forEach((c) => flecha(c._ultimo, nid))
      }
      filasItem.push(iy)
      y = y0 + alto * GY + 40
    }
    const oy = filasItem.length ? (filasItem[0] + filasItem[filasItem.length - 1]) / 2 : 0
    caja('op', 0, oy, `OP ${orden.numero}`, `${orden.cliente} · entrega ${fmtFecha(orden.fecha_compromiso)}`, 'op',
      { background: '#f5b400', border: '1px solid #c99100' })
    items.forEach((it) => flecha('op', `i-${it.id}`))
    return { nodes, edges }
  }, [orden, items, comps, tareas, productos])

  if (items.length === 0) return <div className="vacio">Agrega ítems y productos para ver el mapa.</div>
  return (
    <div>
      <div className="leyenda">
        {[['lista', 'Lista para empezar'], ['en_curso', 'En proceso'], ['pausada', 'Pausada'], ['terminada', 'Terminada'], ['espera', 'Esperando pasos anteriores']].map(([k, t]) => (
          <span key={k}><i style={{ background: COLOR[k].bg, borderColor: COLOR[k].borde }} />{t}</span>
        ))}
      </div>
      <div className="mapa">
        <ReactFlow nodes={nodes} edges={edges} fitView minZoom={0.2} nodesDraggable={false} nodesConnectable={false}>
          <Background gap={24} size={1} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </div>
  )
}

const etiqueta = (e) => ({ lista: 'lista', espera: 'en espera', en_curso: 'en proceso', pausada: 'pausada', terminada: 'terminada' }[e] || e)
