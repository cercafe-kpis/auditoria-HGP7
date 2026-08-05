import { useRef, useState } from 'react';
import imageCompression from 'browser-image-compression';

interface FotoCapturada {
  blob: Blob;
  previewUrl: string;
  nombreArchivo: string;
}

/**
 * Captura de evidencia fotográfica. `capture="environment"` abre
 * directamente la cámara trasera del dispositivo en celulares; el botón
 * secundario permite elegir de la galería. La imagen se comprime en el
 * navegador antes de guardarse localmente (ver arquitectura 7.2 / 8):
 * máx. ~1600px de lado mayor, apuntando a 150–400KB.
 */
export function CameraCapture({
  fotos,
  onFotosChange,
}: {
  fotos: FotoCapturada[];
  onFotosChange: (fotos: FotoCapturada[]) => void;
}) {
  const camaraRef = useRef<HTMLInputElement>(null);
  const galeriaRef = useRef<HTMLInputElement>(null);
  const [comprimiendo, setComprimiendo] = useState(false);

  async function manejarArchivo(file: File) {
    setComprimiendo(true);
    try {
      const comprimido = await imageCompression(file, {
        maxWidthOrHeight: 1600,
        maxSizeMB: 0.4,
        useWebWorker: true,
        initialQuality: 0.8,
      });
      const previewUrl = URL.createObjectURL(comprimido);
      onFotosChange([
        ...fotos,
        { blob: comprimido, previewUrl, nombreArchivo: file.name || `evidencia-${Date.now()}.jpg` },
      ]);
    } finally {
      setComprimiendo(false);
    }
  }

  function quitarFoto(index: number) {
    const copia = [...fotos];
    URL.revokeObjectURL(copia[index].previewUrl);
    copia.splice(index, 1);
    onFotosChange(copia);
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <button
          type="button"
          onClick={() => camaraRef.current?.click()}
          className="h-14 rounded-xl bg-blue-600 text-white font-semibold flex items-center justify-center gap-2"
        >
          📷 Tomar foto
        </button>
        <button
          type="button"
          onClick={() => galeriaRef.current?.click()}
          className="h-14 rounded-xl bg-white border-2 border-slate-300 text-slate-700 font-semibold"
        >
          Elegir de galería
        </button>
      </div>

      <input
        ref={camaraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && void manejarArchivo(e.target.files[0])}
      />
      <input
        ref={galeriaRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && void manejarArchivo(e.target.files[0])}
      />

      {comprimiendo && <p className="text-sm text-slate-500 mb-2">Optimizando foto…</p>}

      <div className="grid grid-cols-3 gap-2">
        {fotos.map((foto, i) => (
          <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-slate-200">
            <img src={foto.previewUrl} alt={`Evidencia ${i + 1}`} className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => quitarFoto(i)}
              className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white text-sm"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
