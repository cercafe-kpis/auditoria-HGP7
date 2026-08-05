import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { useAuthToken } from '../../auth/useAuthToken';
import { listarAuditorias, listarInclinaciones } from '../../graph/lists';
import { useCatalogosOffline } from '../catalogos/useCatalogosOffline';
import { cercafeLogoDataUrl } from '../../assets/cercafeLogo';
import type { AuditoriaRemota, InclinacionRemota } from '../../types/entities';

function primerDiaDelMes(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

/** Convierte "2026-08-01" en "01/08" para etiquetas compactas de eje X. */
function formatearFechaCorta(iso: string): string {
  const partes = iso.split('-');
  if (partes.length !== 3) return iso;
  const [, mes, dia] = partes;
  return `${dia}/${mes}`;
}

const COLOR_CLASIFICACION: Record<string, string> = {
  Bueno: '#16a34a',
  Regular: '#d97706',
  Malo: '#ea580c',
  Insuficiente: '#dc2626',
};

/**
 * Indicadores calculados en el cliente a partir de los datos de las Listas
 * "Auditorías" e "InclinacionHerramienta" (ver documento de arquitectura,
 * sección 9): no hay motor de agregación en servidor, así que se traen los
 * ítems filtrados por rango de fecha/planta y se agregan aquí. Para el
 * volumen esperado (auditorías diarias, no de alta frecuencia) esto es
 * suficiente.
 *
 * Incluye exportación a PDF: se captura como imagen todo el contenido del
 * panel (membrete + KPIs + gráficos, vía `contenidoRef`) con html2canvas y
 * se inserta en un documento jsPDF de una sola página. Es una "foto" de lo
 * que se ve en pantalla en ese momento, no un reporte generado en servidor.
 */
export function IndicadoresPage() {
  const { getAccessToken } = useAuthToken();
  const { plantas } = useCatalogosOffline();
  const [plantaId, setPlantaId] = useState('');
  const [fechaDesde, setFechaDesde] = useState(primerDiaDelMes());
  const [fechaHasta, setFechaHasta] = useState(new Date().toISOString().slice(0, 10));
  const [auditorias, setAuditorias] = useState<AuditoriaRemota[]>([]);
  const [inclinaciones, setInclinaciones] = useState<InclinacionRemota[]>([]);
  const [cargando, setCargando] = useState(false);
  const [exportando, setExportando] = useState(false);
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

  // Un día por fila, con el conteo de cada clasificación ese día — para
  // ver de un vistazo cómo evolucionó la calidad de canal a lo largo del
  // rango filtrado, no solo el acumulado total.
  const porDia = useMemo(() => {
    const mapa = new Map<string, Record<string, number>>();
    for (const a of auditorias) {
      if (!mapa.has(a.fechaAuditoria)) {
        mapa.set(a.fechaAuditoria, { Bueno: 0, Regular: 0, Malo: 0, Insuficiente: 0 });
      }
      const fila = mapa.get(a.fechaAuditoria)!;
      fila[a.clasificacion] = (fila[a.clasificacion] ?? 0) + 1;
    }
    return Array.from(mapa.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([fecha, conteo]) => ({ fecha: formatearFechaCorta(fecha), ...conteo }));
  }, [auditorias]);

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

  // Mismo agrupado por día que `porDia`, pero sumando los totales de
  // inclinación de todas las sesiones registradas ese día (puede haber más
  // de una sesión por día si auditaron varios auditores u operarios).
  const inclinacionPorDia = useMemo(() => {
    const mapa = new Map<string, { revisadas: number; correctas: number }>();
    for (const i of inclinaciones) {
      if (!mapa.has(i.fechaAuditoria)) mapa.set(i.fechaAuditoria, { revisadas: 0, correctas: 0 });
      const fila = mapa.get(i.fechaAuditoria)!;
      fila.revisadas += i.canalesRevisadas;
      fila.correctas += i.canalesCorrectas;
    }
    return Array.from(mapa.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([fecha, datos]) => ({ fecha: formatearFechaCorta(fecha), ...datos }));
  }, [inclinaciones]);

  const nombrePlantaFiltro = plantaId ? plantas.find((p) => p.id === plantaId)?.nombre ?? '—' : 'Todas las plantas';

  async function exportarPDF() {
    if (!contenidoRef.current) return;
    setExportando(true);
    try {
      const canvas = await html2canvas(contenidoRef.current, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
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

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <TarjetaKpi etiqueta="Total auditorías" valor={auditorias.length.toString()} />
          <TarjetaKpi etiqueta="% Canal grasosa" valor={`${porcentajeGrasosa}%`} />
          <TarjetaKpi etiqueta="Bueno" valor={String(porClasificacion.find((c) => c.clasificacion === 'Bueno')?.total ?? 0)} />
          <TarjetaKpi etiqueta="Insuficiente" valor={String(porClasificacion.find((c) => c.clasificacion === 'Insuficiente')?.total ?? 0)} />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <TarjetaKpi etiqueta="% Inclinación correcta" valor={`${inclinacion.porcentaje}%`} />
          <TarjetaKpi etiqueta="Canales revisadas (inclinación)" valor={inclinacion.revisadas.toString()} />
        </div>

        <p className="text-sm font-semibold text-slate-600 mb-2">Clasificación (acumulado del rango)</p>
        <div className="h-64 mb-10">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={porClasificacion}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="clasificacion" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Bar dataKey="total" fill="#2563eb" name="Auditorías" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <p className="text-sm font-semibold text-slate-600 mb-2">Clasificación por día auditado</p>
        <div className="h-64 mb-10">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={porDia}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="fecha" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Legend />
              {(['Bueno', 'Regular', 'Malo', 'Insuficiente'] as const).map((clasificacion) => (
                <Bar
                  key={clasificacion}
                  dataKey={clasificacion}
                  stackId="clasificacion"
                  fill={COLOR_CLASIFICACION[clasificacion]}
                  name={clasificacion}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
        {porDia.length === 0 && (
          <p className="text-sm text-slate-400 -mt-8 mb-10">No hay auditorías registradas en este rango.</p>
        )}

        <p className="text-sm font-semibold text-slate-600 mb-2">Inclinación de la herramienta por día</p>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={inclinacionPorDia}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="fecha" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Bar dataKey="revisadas" fill="#94a3b8" name="Canales revisadas" />
              <Bar dataKey="correctas" fill="#16a34a" name="Inclinación correcta" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        {inclinacionPorDia.length === 0 && (
          <p className="text-sm text-slate-400 mt-2">No hay muestreos de inclinación registrados en este rango.</p>
        )}
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
