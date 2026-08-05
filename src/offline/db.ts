import Dexie, { type Table } from 'dexie';
import type {
  AuditoriaLocal,
  InclinacionLocal,
  SesionActivaLocal,
  Planta,
  Metodologia,
  Operario,
  UsuarioApp,
} from '../types/entities';

/**
 * Base de datos local (IndexedDB vía Dexie). Cuatro propósitos:
 *  1. `auditoriasPendientes`: cola de auditorías de canal capturadas sin
 *     conexión (o con conexión, siempre se pasa por aquí primero — ver
 *     features/auditoria) hasta que se confirman sincronizadas.
 *  2. `inclinacionesPendientes`: el agregado (revisadas/correctas) del
 *     muestreo de inclinación de la herramienta de la sesión activa (ver
 *     features/inclinacion) — a diferencia de `auditoriasPendientes`, este
 *     registro NO se borra al sincronizar: sigue vivo mientras el auditor
 *     siga tocando Sí/No en esa sesión, y cada toque lo vuelve a marcar
 *     'local-pendiente' para reenviar el total actualizado.
 *  3. `sesionActual`: una sola fila (id fijo 'actual') con la "pantalla
 *     inicial" del día (Fecha/Planta/Metodología/Auditor/Operario) — ver
 *     SesionActivaLocal. Se llena una vez y alimenta tanto la Inclinación
 *     como la Clasificación/medición sin volver a pedirla.
 *  4. Catálogos cacheados (`plantas`, `metodologias`, `operarios`,
 *     `usuarios`) para que los formularios funcionen sin conexión — se
 *     refrescan cada vez que hay red disponible.
 */
class AudigrasaDB extends Dexie {
  auditoriasPendientes!: Table<AuditoriaLocal, string>;
  inclinacionesPendientes!: Table<InclinacionLocal, string>;
  sesionActual!: Table<SesionActivaLocal, string>;
  plantas!: Table<Planta, string>;
  metodologias!: Table<Metodologia, string>;
  operarios!: Table<Operario, string>;
  usuarios!: Table<UsuarioApp, string>;

  constructor() {
    super('AudigrasaDB');
    this.version(1).stores({
      auditoriasPendientes: 'idCliente, estado, plantaId, capturadaEn',
      plantas: 'id, activa',
      metodologias: 'id, activa',
      operarios: 'id, plantaId, activo',
      usuarios: 'id, correo, rol',
    });
    // v2: agrega la cola de inclinación de herramienta (muestreo por
    // sesión). Solo agrega una tabla nueva — Dexie no necesita función de
    // upgrade porque no hay datos existentes que migrar.
    this.version(2).stores({
      auditoriasPendientes: 'idCliente, estado, plantaId, capturadaEn',
      inclinacionesPendientes: 'idCliente, estado, plantaId, capturadaEn',
      plantas: 'id, activa',
      metodologias: 'id, activa',
      operarios: 'id, plantaId, activo',
      usuarios: 'id, correo, rol',
    });
    // v3: agrega la sesión activa (pantalla inicial única del día,
    // compartida entre Inclinación y Clasificación/medición).
    this.version(3).stores({
      auditoriasPendientes: 'idCliente, estado, plantaId, capturadaEn',
      inclinacionesPendientes: 'idCliente, estado, plantaId, capturadaEn',
      sesionActual: 'id',
      plantas: 'id, activa',
      metodologias: 'id, activa',
      operarios: 'id, plantaId, activo',
      usuarios: 'id, correo, rol',
    });
  }
}

export const db = new AudigrasaDB();

export async function contarPendientes(): Promise<number> {
  const [auditorias, inclinaciones] = await Promise.all([
    db.auditoriasPendientes.where('estado').anyOf(['local-pendiente', 'sincronizando', 'error-sync']).count(),
    db.inclinacionesPendientes.where('estado').anyOf(['local-pendiente', 'sincronizando', 'error-sync']).count(),
  ]);
  return auditorias + inclinaciones;
}
