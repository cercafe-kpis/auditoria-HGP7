import Dexie, { type Table } from 'dexie';
import type { AuditoriaLocal, Planta, Metodologia, Operario, UsuarioApp } from '../types/entities';

/**
 * Base de datos local (IndexedDB vía Dexie). Dos propósitos:
 *  1. `auditoriasPendientes`: cola de auditorías capturadas sin conexión
 *     (o con conexión, siempre se pasa por aquí primero — ver
 *     features/auditoria) hasta que se confirman sincronizadas.
 *  2. Catálogos cacheados (`plantas`, `metodologias`, `operarios`,
 *     `usuarios`) para que el formulario funcione sin conexión — se
 *     refrescan cada vez que hay red disponible.
 */
class AudigrasaDB extends Dexie {
  auditoriasPendientes!: Table<AuditoriaLocal, string>;
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
  }
}

export const db = new AudigrasaDB();

export async function contarPendientes(): Promise<number> {
  return db.auditoriasPendientes
    .where('estado')
    .anyOf(['local-pendiente', 'sincronizando', 'error-sync'])
    .count();
}
