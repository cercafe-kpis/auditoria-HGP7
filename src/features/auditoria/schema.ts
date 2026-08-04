import { z } from 'zod';

/**
 * Validación estricta del formulario de auditoría — replica en el cliente
 * exactamente las reglas del documento de arquitectura (sección 7.3):
 * todos los campos obligatorios, tiquete no vacío, y al menos una foto.
 * Esta MISMA validación (Zod) es la que decide si el botón de guardar se
 * habilita; no existe un backend adicional que la repita, así que aquí es
 * literalmente la única línea de defensa además de las columnas
 * "obligatorias" configuradas en la Lista de SharePoint.
 */
export const auditoriaSchema = z.object({
  fechaAuditoria: z.string().min(1, 'La fecha es obligatoria'),
  plantaId: z.string().min(1, 'Selecciona una planta'),
  metodologiaId: z.string().min(1, 'Selecciona una metodología'),
  operarioId: z.string().min(1, 'Selecciona un operario'),
  numeroTiquete: z
    .string()
    .trim()
    .min(1, 'El número de tiquete no puede estar vacío'),
  inclinacionHerramienta: z.boolean({ message: 'Campo obligatorio' }),
  tieneMarca: z.boolean({ message: 'Campo obligatorio' }),
  marcaIntercostalCorrecta: z.boolean({ message: 'Campo obligatorio' }),
  clasificacion: z.enum(['Bueno', 'Regular', 'Malo', 'Insuficiente'], {
    message: 'Selecciona una clasificación',
  }),
  canalGrasosa: z.boolean({ message: 'Campo obligatorio' }),
  fotos: z.array(z.unknown()).min(1, 'Debes adjuntar al menos una fotografía'),
});

export type AuditoriaFormValues = z.infer<typeof auditoriaSchema>;
