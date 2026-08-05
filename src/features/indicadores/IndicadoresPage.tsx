import { useEffect, useMemo, useRef, useState } from 'react';
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas-pro';
import { useAuthToken } from '../../auth/useAuthToken';
import { buscarObservacion, guardarObservacion, listarAuditorias, listarInclinaciones } from '../../graph/lists';
import { useCurrentUser } from '../auth/useCurrentUser';
import { useCatalogosOffline } from '../catalogos/useCatalogosOffline';
import { cercafeLogoDataUrl } from '../../assets/cercafeLogo';
import type { AuditoriaRemota, InclinacionRemota } from '../../types/entities';

function primerDiaDelMes(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

/** "3 (43%)" — formato compacto de cantidad + porcentaje usado en varias tarjetas y en la tabla por operario. */
function formatearCantidadYPorcentaje(cantidad: number, total: number): string {
  const porcentaje = total === 0 ? 0 : Math.round((cantidad / total) * 100);
  return `${cantidad} (${porcentaje}%)`;
}

const COLOR_CLASIFICACION: Record<string, string> = {
  Bueno: '#16a34a',
  Regular: '#eab308',
  Malo: '#ea580c',
  Insuficiente: '#dc2626',
};

const COLOR_INCLINACION_CORRECTA = '#16a34a';
const COLOR_INCLINACION_INCORRECTA = '#dc2626';

/**
 * Indicadores calculados en el cliente a partir de los datos de las Listas
 * "Auditorías" e "InclinacionHerramienta" (ver documento de arquitectura,
 * sección 9): no hay motor de agregación en servidor, así que se traen los
 * ítems filtrados por rango de fecha/planta y se agregan aquí. Para el
 * volumen esperado (auditorías diarias, no de alta frecuencia) esto es
 * suficiente.
 *
 * Todas las gráficas muestran sus etiquetas de valor/porcentaje SIEMPRE
 * visibles (no solo al pasar el mouse) — es necesario porque el PDF
 * exportado es una "foto" estática del panel (ver exportarPDF) y un
 * tooltip que solo aparece con hover no saldría en esa foto.
 *
 * Incluye exportación a PDF: se captura como imagen todo el contenido del
 * panel (membrete + KPIs + gráficos + tabla por operario, vía
 * `contenidoRef`) con html2canvas-pro y se inserta en un documento jsPDF
 * de una sola página. Usamos el fork "html2canvas-pro" (no "html2canvas"
 * a secas) porque la librería original no sabe interpretar el formato de
 * color `oklch(...)` que Tailwind v4 usa para TODOS sus colores — con la
 * original, exportar tiraba un error silencioso ("Attempting to parse an
 * unsupported color function oklch") y no generaba nada.
 */
export function IndicadoresPage() {
  const { getAccessToken } = useAuthToken();
  const { usuario, correo } = useCurrentUser();
  const puedeEditarObservacion = usuario?.rol !== 'Consulta';
  const { plantas, operarios } = useCatalogosOffline();
  const [plantaId, setPlantaId] = useState('');
  const [fechaDesde, setFechaDesde] = useState(primerDiaDelMes());
  const [fechaHasta, setFechaHasta] = useState(new Date().toISOString().slice(0, 10));
  const [auditorias, setAuditorias] = useState<AuditoriaRemota[]>([]);
  const [inclinaciones, setInclinaciones] = useState<InclinacionRemota[]>([]);
  const [cargando, setCargando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [errorExportando, setErrorExportando] = useState<string | null>(null);
  const [observaciones, setObservaciones] = useState('');
  const [cargandoObservacion, setCargandoObservacion] = useState(false);
  const [guardandoObservacion, setGuardandoObservacion] = useState(false);
  const [errorObservacion, setErrorObservacion] = useState<string | null>(null);
  const [observacionGuardadaEn, setObservacionGuardadaEn] = useState<string | null>(null);
  const contenidoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelado = false;
    async function cargar() {
      if (!navigator.onLine) return;
      setCargando(true);
      try {
        const token = await getAccessToken();
        const [datosAuditorias, datosInclinaciones] = await Promise.all([
          listarAuditorias(token, {
            plantaId: plantaId || undefined,
            fechaDesde,
            fechaHasta,
          }),
          listarInclinaciones(token, {
            plantaId: plantaId || undefined,
            fechaDesde,
            fechaHasta,
          }),
        ]);
        if (!cancelado) {
          setAuditorias(datosAuditorias);
          setInclinaciones(datosInclinaciones);
        }
      } finally {
        if (!cancelado) setCargando(false);
      }
    }
    void cargar();
    return () => {
      cancelado = true;
    };
  }, [plantaId, fechaDesde, fechaHasta]); // eslint-disable-line react-hooks/exhaustive-deps

  // La observación guardada está ligada a esta combinación exacta de
  // filtros (ver claveObservacion en graph/lists.ts) — al cambiar de
  // planta o de rango, se reemplaza el texto por el que esté guardado para
  // esos filtros (o se limpia si todavía no hay ninguno).
  useEffect(() => {
    let cancelado = false;
    async function cargarObservacion() {
      if (!navigator.onLine) return;
      setCargandoObservacion(true);
      setErrorObservacion(null);
      setObservacionGuardadaEn(null);
      try {
        const token = await getAccessToken();
        const existente = await buscarObservacion(token, plantaId, fechaDesde, fechaHasta);
        if (!cancelado) {
          setObservaciones(existente?.texto ?? '');
          if (existente) setObservacionGuardadaEn(existente.actualizadoEn);
        }
      } catch (e) {
        if (!cancelado) setErrorObservacion(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelado) setCargandoObservacion(false);
      }
    }
    void cargarObservacion();
    return () => {
      cancelado = true;
    };
  }, [plantaId, fechaDesde, fechaHasta]); // eslint-disable-line react-hooks/exhaustive-deps

  async function guardarObservacionAhora() {
    setGuardandoObservacion(true);
    setErrorObservacion(null);
    try {
      const token = await getAccessToken();
      const guardada = await guardarObservacion(token, {
        plantaId,
        fechaDesde,
        fechaHasta,
        texto: observaciones,
        correo: correo ?? '',
      });
      setObservacionGuardadaEn(guardada.actualizadoEn);
    } catch (e) {
      setErrorObservacion(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardandoObservacion(false);
    }
  }

  const porClasificacion = useMemo(() => {
    const conteo: Record<string, number> = { Bueno: 0, Regular: 0, Malo: 0, Insuficiente: 0 };
    for (const a of auditorias) conteo[a.clasificacion] = (conteo[a.clasificacion] ?? 0) + 1;
    return Object.entries(conteo).map(([clasificacion, total]) => ({ clasificacion, total }));
  }, [auditorias]);

  const porcentajeGrasosa = useMemo(() => {
    if (auditorias.length === 0) return 0;
    const grasosas = auditorias.filter((a) => a.canalGrasosa).length;
    return Math.round((grasosas / auditorias.length) * 100);
  }, [auditorias]);

  // Cantidad y % de canales con marca, y de esas cuántas con la marca
  // intercostal correcta — acumulado del rango filtrado (ver también
  // porOperario para el mismo desglose pero comparado entre operarios).
  const marca = useMemo(() => {
    const total = auditorias.length;
    const conMarca = auditorias.filter((a) => a.tieneMarca).length;
    const marcaCorrecta = auditorias.filter((a) => a.marcaIntercostalCorrecta).length;
    return { total, conMarca, marcaCorrecta };
  }, [auditorias]);

  // Comparativo por operario: por cada operario auditado en el rango,
  // cuántas canales se le revisaron y de esas cuántas tenían marca y
  // cuántas tenían la marca intercostal correcta — para ver si un
  // operario en particular está fallando en la marca de forma sistemática.
  const porOperario = useMemo(() => {
    const mapa = new Map<string, { total: number; conMarca: number; marcaCorrecta: number }>();
    for (const a of auditorias) {
      if (!mapa.has(a.operarioId)) mapa.set(a.operarioId, { total: 0, conMarca: 0, marcaCorrecta: 0 });
      const fila = mapa.get(a.operarioId)!;
      fila.total += 1;
      if (a.tieneMarca) fila.conMarca += 1;
      if (a.marcaIntercostalCorrecta) fila.marcaCorrecta += 1;
    }
    return Array.from(mapa.entries())
      .map(([operarioId, datos]) => ({
        operarioId,
        nombre: operarios.find((o) => o.id === operarioId)?.nombre ?? '—',
        ...datos,
      }))
      .sort((a, b) => b.total - a.total);
  }, [auditorias, operarios]);

  // Inclinación de la herramienta: es un muestreo por sesión (no por
  // canal/tiquete, ver InclinacionLocal), así que el % se calcula sumando
  // canales revisadas/correctas de TODAS las sesiones del rango filtrado,
  // no promediando auditorías individuales.
  const inclinacion = useMemo(() => {
    const revisadas = inclinaciones.reduce((acc, i) => acc + i.canalesRevisadas, 0);
    const correctas = inclinaciones.reduce((acc, i) => acc + i.canalesCorrectas, 0);
    const porcentaje = revisadas === 0 ? 0 : Math.round((correctas / revisadas) * 100);
    return { revisadas, correctas, porcentaje };
  }, [inclinaciones]);

  const inclinacionPie = useMemo(
    () => [
      { nombre: 'Correcta', valor: inclinacion.correctas },
      { nombre: 'Incorrecta', valor: inclinacion.revisadas - inclinacion.correctas },
    ],
    [inclinacion],
  );

  const nombrePlantaFiltro = plantaId ? plantas.find((p) => p.id === plantaId)?.nombre ?? '—' : 'Todas las plantas';

  async function exportarPDF() {
    if (!contenidoRef.current) return;
    setExportando(true);
    setErrorExportando(null);
    try {
      const canvas = await html2canvas(contenidoRef.current, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
        // html2canvas-pro (igual que el html2canvas original) NO sabe
        // dibujar bien el contenido de un <textarea>: lo pinta con una
        // fuente distinta y SIN el salto de línea automático, así que
        // texto largo queda cortado a la derecha en vez de verse en
        // varias líneas — se nota más en pantallas angostas (celular)
        // porque ahí el mismo texto necesitaría más líneas para verse
        // completo. onclone corre sobre una copia del DOM que solo usa
        // esta captura (no toca la pantalla real): ahí reemplazamos el
        // <textarea> por un <div> con el mismo texto, que sí se dibuja
        // como texto normal, con el salto de línea correcto.
        onclone: (clonedDoc) => {
          const textarea = clonedDoc.getElementById('observaciones-textarea') as HTMLTextAreaElement | null;
          if (textarea) {
            const espejo = clonedDoc.createElement('div');
            espejo.textContent =
              textarea.value.trim() || 'Sin observaciones registradas para este periodo.';
            espejo.className = textarea.className;
            espejo.style.whiteSpace = 'pre-wrap';
            espejo.style.wordBreak = 'break-word';
            espejo.style.minHeight = `${textarea.offsetHeight}px`;
            if (!textarea.value.trim()) espejo.style.color = '#94a3b8'; // slate-400, igual que el placeholder
            textarea.replaceWith(espejo);
          }
        },
      });
      const imgData = canvas.toDataURL('image/png');
      const orientacion = canvas.width > canvas.height ? 'landscape' : 'portrait';
      const pdf = new jsPDF({ orientation: orientacion, unit: 'pt', format: 'a4' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margen = 24;
      const ratio = Math.min(
        (pageWidth - margen * 2) / canvas.width,
        (pageHeight - margen * 2) / canvas.height,
      );
      const imgWidth = canvas.width * ratio;
      const imgHeight = canvas.height * ratio;
      const x = (pageWidth - imgWidth) / 2;
      pdf.addImage(imgData, 'PNG', x, margen, imgWidth, imgHeight);
      pdf.save(`Indicadores_HGP7_${fechaDesde}_a_${fechaHasta}.pdf`);
    } catch (err) {
      // No dejar el error en silencio: sin este catch, un fallo en
      // html2canvas simplemente no producía nada y el usuario no tenía
      // forma de saber que algo salió mal.
      setErrorExportando(err instanceof Error ? err.message : 'No se pudo generar el PDF.');
    } finally {
      setExportando(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-4">
      <div className="flex items-center justify-between mb-4 gap-3">
        <h1 className="text-xl font-bold text-slate-800">Indicadores de desempeño</h1>
        <button
          type="button"
          onClick={() => void exportarPDF()}
          disabled={exportando || cargando}
          className="h-10 px-4 rounded-lg bg-slate-800 text-white text-sm font-semibold whitespace-nowrap disabled:opacity-50"
        >
          {exportando ? 'Generando PDF…' : '⬇ Exportar a PDF'}
        </button>
      </div>

      {errorExportando && (
        <div className="mb-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm">
          No se pudo generar el PDF: {errorExportando}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <select value={plantaId} onChange={(e) => setPlantaId(e.target.value)} className="h-11 rounded-lg border border-slate-300 px-3">
          <option value="">Todas las plantas</option>
          {plantas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
        <input type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} className="h-11 rounded-lg border border-slate-300 px-3" />
        <input type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} className="h-11 rounded-lg border border-slate-300 px-3" />
      </div>

      {cargando && <p className="text-slate-500 mb-4">Cargando…</p>}

      {/* Todo lo que hay dentro de este div es exactamente lo que se
          exporta a PDF (ver exportarPDF) — por eso lleva su propio
          membrete con el logo, aunque en pantalla ya se vea el logo en
          la barra de navegación de arriba. */}
      <div ref={contenidoRef} className="bg-white p-4 rounded-xl">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4 mb-5">
          <div>
            <p className="text-lg font-bold text-slate-800">Indicadores de desempeño — Auditoría HGP7</p>
            <p className="text-sm text-slate-500">
              {nombrePlantaFiltro} · {fechaDesde} a {fechaHasta}
            </p>
          </div>
          <img src={cercafeLogoDataUrl} alt="Cercafe" className="h-12 w-auto shrink-0" />
        </div>

        {/* Tarjetas generales. */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
          <TarjetaKpi etiqueta="Canales revisadas (Clasificación)" valor={auditorias.length.toString()} />
          <TarjetaKpi etiqueta="% Canal grasosa" valor={`${porcentajeGrasosa}%`} />
          <TarjetaKpi etiqueta="Bueno" valor={formatearCantidadYPorcentaje(porClasificacion.find((c) => c.clasificacion === 'Bueno')?.total ?? 0, auditorias.length)} />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
          <TarjetaKpi etiqueta="% Inclinación correcta" valor={`${inclinacion.porcentaje}%`} />
          <TarjetaKpi etiqueta="Tiene marca" valor={formatearCantidadYPorcentaje(marca.conMarca, marca.total)} />
          <TarjetaKpi etiqueta="Marca correcta" valor={formatearCantidadYPorcentaje(marca.marcaCorrecta, marca.total)} />
        </div>

        {/* Clasificación acumulada — torta con % + cuadro de cantidades. */}
        <p className="text-sm font-semibold text-slate-600 mb-2">Clasificación (acumulado del rango)</p>
        {auditorias.length === 0 ? (
          <p className="text-sm text-slate-400 mb-10">No hay auditorías registradas en este rango.</p>
        ) : (
          <div className="mb-10">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart margin={{ top: 24, right: 24, bottom: 8, left: 24 }}>
                  <Pie
                    data={porClasificacion}
                    dataKey="total"
                    nameKey="clasificacion"
                    cx="50%"
                    cy="50%"
                    outerRadius={85}
                    label={(props) => `${Math.round((props.percent ?? 0) * 100)}%`}
                  >
                    {porClasificacion.map((entrada) => (
                      <Cell key={entrada.clasificacion} fill={COLOR_CLASIFICACION[entrada.clasificacion]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
              {porClasificacion.map((c) => (
                <div key={c.clasificacion} className="rounded-xl border border-slate-200 p-3 text-center">
                  <p className="text-xl font-bold" style={{ color: COLOR_CLASIFICACION[c.clasificacion] }}>
                    {c.total}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">{c.clasificacion}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Inclinación acumulada — torta con % correcta/incorrecta + tarjetas. */}
        <p className="text-sm font-semibold text-slate-600 mb-2">Inclinación de la herramienta (acumulado del rango)</p>
        {inclinacion.revisadas === 0 ? (
          <p className="text-sm text-slate-400 mb-10">No hay muestreos de inclinación registrados en este rango.</p>
        ) : (
          <div className="mb-10">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart margin={{ top: 24, right: 24, bottom: 8, left: 24 }}>
                  <Pie
                    data={inclinacionPie}
                    dataKey="valor"
                    nameKey="nombre"
                    cx="50%"
                    cy="50%"
                    outerRadius={85}
                    label={(props) => `${Math.round((props.percent ?? 0) * 100)}%`}
                  >
                    <Cell fill={COLOR_INCLINACION_CORRECTA} />
                    <Cell fill={COLOR_INCLINACION_INCORRECTA} />
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-3 gap-3 mt-3">
              <div className="rounded-xl border border-slate-200 p-3 text-center">
                <p className="text-xl font-bold text-slate-800">{inclinacion.revisadas}</p>
                <p className="text-xs text-slate-500 mt-1">Total revisadas</p>
              </div>
              <div className="rounded-xl border border-slate-200 p-3 text-center">
                <p className="text-xl font-bold text-emerald-600">{inclinacion.correctas}</p>
                <p className="text-xs text-slate-500 mt-1">Inclinación correcta (cantidad)</p>
              </div>
              <div className="rounded-xl border border-slate-200 p-3 text-center">
                <p className="text-xl font-bold text-emerald-600">{inclinacion.porcentaje}%</p>
                <p className="text-xs text-slate-500 mt-1">Inclinación correcta (%)</p>
              </div>
            </div>
          </div>
        )}

        {/* Comparativo por operario — marca intercostal. */}
        <p className="text-sm font-semibold text-slate-600 mb-2">Comparativo por operario — marca intercostal</p>
        {porOperario.length === 0 ? (
          <p className="text-sm text-slate-400">No hay auditorías registradas en este rango.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-600 text-left">
                  <th className="px-3 py-2 font-semibold">Operario</th>
                  <th className="px-3 py-2 font-semibold text-right">Auditorías</th>
                  <th className="px-3 py-2 font-semibold text-right">Tiene marca</th>
                  <th className="px-3 py-2 font-semibold text-right">Marca correcta</th>
                </tr>
              </thead>
              <tbody>
                {porOperario.map((fila) => (
                  <tr key={fila.operarioId} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-medium text-slate-800">{fila.nombre}</td>
                    <td className="px-3 py-2 text-right">{fila.total}</td>
                    <td className="px-3 py-2 text-right">{formatearCantidadYPorcentaje(fila.conMarca, fila.total)}</td>
                    <td className="px-3 py-2 text-right">{formatearCantidadYPorcentaje(fila.marcaCorrecta, fila.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Recomendaciones/observaciones del auditor — opcional, en texto
            libre. Se incluye como último bloque del informe (también
            queda en el PDF exportado, ya que está dentro de contenidoRef,
            y html2canvas-pro sí captura el valor actual de un <textarea>).
            Queda guardada en SharePoint ligada a esta combinación exacta
            de planta+rango (ver claveObservacion), así que si vuelves a
            entrar con los mismos filtros la vuelves a ver. */}
        <div className="mt-8">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3 mb-2">
            <label className="block text-sm font-semibold text-slate-600">
              Recomendaciones y observaciones{' '}
              <span className="text-slate-400 font-normal">(opcional)</span>
            </label>
            {puedeEditarObservacion && (
              <button
                type="button"
                onClick={() => void guardarObservacionAhora()}
                disabled={guardandoObservacion || cargandoObservacion}
                className="h-9 px-3 rounded-lg bg-blue-600 text-white text-xs font-semibold whitespace-nowrap self-start sm:self-auto disabled:opacity-50"
              >
                {guardandoObservacion ? 'Guardando…' : 'Guardar observación'}
              </button>
            )}
          </div>
          <textarea
            id="observaciones-textarea"
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            placeholder={
              puedeEditarObservacion
                ? 'Escribe aquí observaciones o recomendaciones sobre este periodo, si lo consideras necesario…'
                : 'Sin observaciones para este periodo.'
            }
            rows={4}
            disabled={cargandoObservacion || !puedeEditarObservacion}
            className="w-full rounded-xl border border-slate-200 p-3 text-sm text-slate-700 placeholder:text-slate-400 disabled:opacity-60"
          />
          {cargandoObservacion && <p className="text-xs text-slate-400 mt-1">Cargando observación guardada…</p>}
          {errorObservacion && (
            <p className="text-xs text-rose-600 mt-1">No se pudo guardar/cargar: {errorObservacion}</p>
          )}
          {!cargandoObservacion && !errorObservacion && observacionGuardadaEn && (
            <p className="text-xs text-emerald-600 mt-1">
              Guardada — última vez el {new Date(observacionGuardadaEn).toLocaleString('es-CO')}.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function TarjetaKpi({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="rounded-xl border border-slate-200 p-4 text-center">
      <p className="text-2xl font-bold text-slate-800">{valor}</p>
      <p className="text-xs text-slate-500 mt-1">{etiqueta}</p>
    </div>
  );
}
