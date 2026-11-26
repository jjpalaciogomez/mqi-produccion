// Generador mínimo de archivos .xlsx (sin librerías externas).
// aoa = arreglo de filas; cada celda puede ser número, texto o vacío.
const enc = new TextEncoder()
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 } return t })()
const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
const colL = (i) => { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26) } return s }

function zip(archivos) {
  const partes = [], central = []
  let off = 0
  archivos.forEach(({ nombre, datos }) => {
    const n = enc.encode(nombre), crc = crc32(datos)
    const loc = new DataView(new ArrayBuffer(30))
    loc.setUint32(0, 0x04034b50, true); loc.setUint16(4, 20, true); loc.setUint16(8, 0, true)
    loc.setUint32(14, crc, true); loc.setUint32(18, datos.length, true); loc.setUint32(22, datos.length, true); loc.setUint16(26, n.length, true)
    partes.push(new Uint8Array(loc.buffer), n, datos)
    const cen = new DataView(new ArrayBuffer(46))
    cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true)
    cen.setUint32(16, crc, true); cen.setUint32(20, datos.length, true); cen.setUint32(24, datos.length, true); cen.setUint16(28, n.length, true)
    cen.setUint32(42, off, true)
    central.push(new Uint8Array(cen.buffer), n)
    off += 30 + n.length + datos.length
  })
  const tamC = central.reduce((a, b) => a + b.length, 0)
  const fin = new DataView(new ArrayBuffer(22))
  fin.setUint32(0, 0x06054b50, true); fin.setUint16(8, archivos.length, true); fin.setUint16(10, archivos.length, true)
  fin.setUint32(12, tamC, true); fin.setUint32(16, off, true)
  return new Blob([...partes, ...central, new Uint8Array(fin.buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

export function crearXlsx(hojas) {
  // hojas: [{ nombre, filas: aoa, anchos?: [n] }]
  const sheets = hojas.map((h, i) => {
    const filas = h.filas.map((f, r) => `<row r="${r + 1}">` + f.map((v, c) => {
      if (v === null || v === undefined || v === '') return ''
      const ref = colL(c) + (r + 1)
      return typeof v === 'number' && isFinite(v) ? `<c r="${ref}"><v>${v}</v></c>` : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`
    }).join('') + '</row>').join('')
    const cols = h.anchos ? '<cols>' + h.anchos.map((w, c) => `<col min="${c + 1}" max="${c + 1}" width="${w}" customWidth="1"/>`).join('') + '</cols>' : ''
    return { nombre: `xl/worksheets/sheet${i + 1}.xml`, datos: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols}<sheetData>${filas}</sheetData></worksheet>`) }
  })
  const archivos = [
    { nombre: '[Content_Types].xml', datos: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${hojas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`) },
    { nombre: '_rels/.rels', datos: enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>') },
    { nombre: 'xl/workbook.xml', datos: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${hojas.map((h, i) => `<sheet name="${esc(h.nombre).slice(0, 31)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`) },
    { nombre: 'xl/_rels/workbook.xml.rels', datos: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${hojas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>`) },
    ...sheets,
  ]
  return zip(archivos)
}

export function descargarXlsx(nombreArchivo, hojas) {
  const url = URL.createObjectURL(crearXlsx(hojas))
  const a = document.createElement('a')
  a.href = url; a.download = nombreArchivo
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export const descargarTabla = (nombre, encabezados, filas) => descargarXlsx(nombre, [{ nombre: 'Informe', filas: [encabezados, ...filas] }])

// Archivo de pago masivo Bancolombia (formato PAB), igual al que generaba la hoja
export function archivoBancolombia(res, tipo = 'NOMINA') {
  const e = res.encabezado
  const filas = [
    ['NIT PAGADOR', 'TIPO DE PAGO', 'APLICACIÓN', 'SECUENCIA DE ENVÍO', 'NRO CUENTA A DEBITAR', 'TIPO DE CUENTA A DEBITAR', 'DESCRIPCIÓN DEL PAGO'],
    [e.NitPagador, e.TipoPago, e.Aplicacion, e.SecuenciaEnvio, e.CuentaADebitar, e.TipoCuentaADebitar, e.DescripcionPago],
    ['Tipo Documento Beneficiario', 'Nit Beneficiario', 'Nombre Beneficiario ', 'Tipo Transaccion ', 'Código Banco ', 'No Cuenta Beneficiario ', 'Email ', 'Documento Autorizado ', 'Referencia ', 'Celular Beneficiario', 'ValorTransaccion ', 'Fecha de aplicación'],
    ...res.filas.map((f) => [f.TipoDocumento, f.NitBeneficiario, f.NombreBeneficiario, f.TipoTransaccion, f.CodigoBanco, f.NoCuentaBeneficiario, '', '', f.Referencia, '', f.ValorTransaccion, f.FechaAplicacion]),
  ]
  const nombre = `PAGO_${tipo}_BANCOLOMBIA_${e.DescripcionPago}.xlsx`
  descargarXlsx(nombre, [{ nombre: 'FORMATOPAB', filas, anchos: [14, 12, 26, 12, 26, 22, 14, 22, 14, 22, 14, 14] }])
  return nombre
}
