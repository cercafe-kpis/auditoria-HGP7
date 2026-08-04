import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useAuthToken } from '../../auth/useAuthToken';
import { listarAuditorias } from '../../graph/lists';
import { useCatalogosOffline } from '../catalogos/useCatalogosOffline';
import type { AuditoriaRemota } from '../../types/entities';

function primerDiaDelMes(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

/**
 * Indicadores calculados en el cliente a partir de los datos de la Lista
 * "Auditorías" (ver documento de arquitectura, sección 9): no hay motor
 * de agregación en servidor, así que se traen los ítems filtrados por
 * rango de fecha/planta y se agregan aquí. Para el volumen esperado
 * (auditorías diarias, no de alta frecuencia) esto es suficiente.
 */
export function IndicadoresPage() {
  const { getAccessToken } = useAuthToken();
  const { plantas } = useCatalogosOffline();
  const [plantaId, setPlantaId] = useState('');
  const [fechaDesde, setFechaDesde] = useState(primerDiaDelMes());
  const [fechaHasta, setFechaHasta] = useState(new Date().toISOString().slice(0, 10));
  const [auditorias, setAuditorias] = useState<AuditoriaRemota[]>([]);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    let cancelado = false;
    async function cargar() {
      if (!navigator.onLine) return;
      setCargando(true);
      try {
        const token = await getAccessToken();
        const datos = await listarAuditorias(token, {
          plantaId: plantaId || undefined,
          fechaDesde,
          fechaHasta,
        });
        if (!cancelado) setAuditorias(datos);
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

  return (
    <div className="max-w-3xl mx-auto p-4">
      <h1 className="text-xl font-bold text-slate-800 mb-4">Indicadores de desempeño</h1>

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

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <TarjetaKpi etiqueta="Total auditorías" valor={auditorias.length.toString()} />
        <TarjetaKpi etiqueta="% Canal grasosa" valor={`${porcentajeGrasosa}%`} />
        <TarjetaKpi etiqueta="Bueno" valor={String(porClasificacion.find((c) => c.clasificacion === 'Bueno')?.total ?? 0)} />
        <TarjetaKpi etiqueta="Insuficiente" valor={String(porClasificacion.find((c) => c.clasificacion === 'Insuficiente')?.total ?? 0)} />
      </div>

      <div className="h-64">
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
