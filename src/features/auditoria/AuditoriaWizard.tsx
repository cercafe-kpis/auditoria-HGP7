import { useState } from 'react';
import { useCatalogosOffline } from '../catalogos/useCatalogosOffline';
import { useCurrentUser } from '../auth/useCurrentUser';
import { SegmentedYesNo } from '../../components/SegmentedYesNo';
import { ClassificationPicker } from '../../components/ClassificationPicker';
import { CameraCapture } from '../../components/CameraCapture';
import { db } from '../../offline/db';
import { auditoriaSchema } from './schema';
import type { Clasificacion, AuditoriaLocal, SesionActivaLocal } from '../../types/entities';

interface FotoCapturada {
  blob: Blob;
  previewUrl: string;
  nombreArchivo: string;
}

const PASOS = ['Evaluación y evidencia', 'Revisión'] as const;

function nuevoUuid(): string {
  return crypto.randomUUID();
}

/**
 * Wizard de la auditoría de canal ("Clasificación / medición"). Ya NO
 * pide Fecha/Planta/Metodología/Auditor/Operario — esos vienen de la
 * sesión activa del día (ver SesionForm/SesionPage) y se reciben aquí por
 * props. Arranca directo en Tiquete.
 */
export function AuditoriaWizard({
  sesion,
  onGuardada,
}: {
  sesion: SesionActivaLocal;
  onGuardada: () => void;
}) {
  const { usuario } = useCurrentUser();
  const { plantas, metodologias, operarios } = useCatalogosOffline();

  const [paso, setPaso] = useState(0);
  const [guardando, setGuardando] = useState(false);
  const [errores, setErrores] = useState<string[]>([]);

  // Paso "Evaluación y evidencia"
  const [numeroTiquete, setNumeroTiquete] = useState('');
  const [tieneMarca, setTieneMarca] = useState<boolean | null>(null);
  const [marcaIntercostalCorrecta, setMarcaIntercostalCorrecta] = useState<boolean | null>(null);
  const [clasificacion, setClasificacion] = useState<Clasificacion | null>(null);
  const [canalGrasosa, setCanalGrasosa] = useState<boolean | null>(null);
  const [fotos, setFotos] = useState<FotoCapturada[]>([]);

  function validarPasoActual(): boolean {
    if (paso === 0) {
      const faltan: string[] = [];
      if (!numeroTiquete.trim()) faltan.push('Número de tiquete');
      if (tieneMarca === null) faltan.push('¿Tiene marca?');
      if (marcaIntercostalCorrecta === null) faltan.push('¿Marca intercostal correcta?');
      if (!clasificacion) faltan.push('Clasificación');
      if (canalGrasosa === null) faltan.push('¿Canal grasosa?');
      setErrores(faltan);
      return faltan.length === 0;
    }
    return true;
  }

  function siguiente() {
    if (validarPasoActual()) setPaso((p) => Math.min(p + 1, PASOS.length - 1));
  }

  function anterior() {
    setErrores([]);
    setPaso((p) => Math.max(p - 1, 0));
  }

  async function guardar() {
    const candidato = {
      fechaAuditoria: sesion.fechaAuditoria,
      plantaId: sesion.plantaId,
      metodologiaId: sesion.metodologiaId,
      operarioId: sesion.operarioId,
      numeroTiquete: numeroTiquete.trim(),
      tieneMarca,
      marcaIntercostalCorrecta,
      clasificacion,
      canalGrasosa,
      fotos,
    };
    const parsed = auditoriaSchema.safeParse(candidato);
    if (!parsed.success) {
      setErrores(parsed.error.issues.map((i) => i.message));
      return;
    }

    setGuardando(true);
    try {
      const idCliente = nuevoUuid();
      const registro: AuditoriaLocal = {
        idCliente,
        fechaAuditoria: sesion.fechaAuditoria,
        plantaId: sesion.plantaId,
        metodologiaId: sesion.metodologiaId,
        auditorCorreo: sesion.auditorCorreo,
        operarioId: sesion.operarioId,
        numeroTiquete: numeroTiquete.trim(),
        tieneMarca: tieneMarca as boolean,
        marcaIntercostalCorrecta: marcaIntercostalCorrecta as boolean,
        clasificacion: clasificacion as Clasificacion,
        canalGrasosa: canalGrasosa as boolean,
        capturadaEn: new Date().toISOString(),
        fotos: fotos.map((f, i) => ({
          orden: i + 1,
          blob: f.blob,
          nombreArchivo: f.nombreArchivo,
          tomadaEn: new Date().toISOString(),
        })),
        estado: 'local-pendiente',
        intentosSync: 0,
      };
      // Guardado inmediato en IndexedDB — la app NO espera respuesta de
      // red aquí. El service de sincronización (useSyncQueue) se encarga
      // de subirla cuando haya conexión. Ver arquitectura, sección 8.
      await db.auditoriasPendientes.add(registro);
      onGuardada();
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="max-w-md mx-auto p-4 pb-24">
      <div className="flex items-center gap-2 mb-6">
        {PASOS.map((nombre, i) => (
          <div key={nombre} className="flex-1">
            <div className={`h-1.5 rounded-full ${i <= paso ? 'bg-blue-600' : 'bg-slate-200'}`} />
          </div>
        ))}
      </div>
      <h2 className="text-lg font-bold text-slate-800 mb-4">{PASOS[paso]}</h2>

      {errores.length > 0 && (
        <div className="mb-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm">
          <ul className="list-disc list-inside">
            {errores.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {paso === 0 && (
        <div>
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-1">Número de tiquete</label>
            <input
              type="text"
              inputMode="numeric"
              value={numeroTiquete}
              onChange={(e) => setNumeroTiquete(e.target.value)}
              className="w-full h-12 rounded-lg border border-slate-300 px-3"
              placeholder="Ej. 10234"
            />
          </div>
          <SegmentedYesNo label="¿Tiene marca?" value={tieneMarca} onChange={setTieneMarca} />
          <SegmentedYesNo
            label="¿La marca intercostal es correcta?"
            value={marcaIntercostalCorrecta}
            onChange={setMarcaIntercostalCorrecta}
          />
          <ClassificationPicker value={clasificacion} onChange={setClasificacion} />
          <SegmentedYesNo label="¿La canal está grasosa?" value={canalGrasosa} onChange={setCanalGrasosa} />
          <div className="mt-4">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Evidencia fotográfica <span className="text-slate-400 font-normal">(opcional)</span>
            </label>
            <CameraCapture fotos={fotos} onFotosChange={setFotos} />
          </div>
        </div>
      )}

      {paso === 1 && (
        <div className="space-y-2 text-sm">
          <ResumenFila etiqueta="Fecha" valor={sesion.fechaAuditoria} />
          <ResumenFila etiqueta="Planta" valor={plantas.find((p) => p.id === sesion.plantaId)?.nombre ?? '—'} />
          <ResumenFila
            etiqueta="Metodología"
            valor={metodologias.find((m) => m.id === sesion.metodologiaId)?.nombre ?? '—'}
          />
          <ResumenFila etiqueta="Auditor" valor={usuario?.nombre ?? sesion.auditorCorreo} />
          <ResumenFila etiqueta="Operario" valor={operarios.find((o) => o.id === sesion.operarioId)?.nombre ?? '—'} />
          <ResumenFila etiqueta="Tiquete" valor={numeroTiquete} />
          <ResumenFila etiqueta="Tiene marca" valor={tieneMarca ? 'Sí' : 'No'} />
          <ResumenFila etiqueta="Marca intercostal correcta" valor={marcaIntercostalCorrecta ? 'Sí' : 'No'} />
          <ResumenFila etiqueta="Clasificación" valor={clasificacion ?? '—'} />
          <ResumenFila etiqueta="Canal grasosa" valor={canalGrasosa ? 'Sí' : 'No'} />
          <ResumenFila etiqueta="Fotos" valor={`${fotos.length}`} />
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-4 flex gap-3">
        {paso > 0 && (
          <button
            onClick={anterior}
            className="flex-1 h-14 rounded-xl border-2 border-slate-300 text-slate-700 font-semibold"
          >
            Atrás
          </button>
        )}
        {paso < PASOS.length - 1 ? (
          <button onClick={siguiente} className="flex-1 h-14 rounded-xl bg-blue-600 text-white font-semibold">
            Continuar
          </button>
        ) : (
          <button
            onClick={() => void guardar()}
            disabled={guardando}
            className="flex-1 h-14 rounded-xl bg-emerald-600 text-white font-semibold disabled:opacity-60"
          >
            {guardando ? 'Guardando…' : 'Guardar auditoría'}
          </button>
        )}
      </div>
    </div>
  );
}

function ResumenFila({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex justify-between border-b border-slate-100 py-1.5">
      <span className="text-slate-500">{etiqueta}</span>
      <span className="font-medium text-slate-800">{valor}</span>
    </div>
  );
}
