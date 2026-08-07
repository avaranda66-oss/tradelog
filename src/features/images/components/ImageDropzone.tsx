'use client';

import { useRef, useState, useEffect } from 'react';
import { uploadTradeImage, deleteTradeImage } from '@/features/images/actions';

interface ImageItem {
  id: string;
  filePath: string;
  caption?: string | null;
  imageType?: string | null;
}

interface ImageDropzoneProps {
  tradeId: string;
  date: string;
  images: ImageItem[];
  onUploaded?: () => void;
}

export function ImageDropzone({ tradeId, date, images: initialImages, onUploaded }: ImageDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [images, setImages] = useState<ImageItem[]>(initialImages);
  const [selectedImage, setSelectedImage] = useState<ImageItem | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sincroniza com props
  useEffect(() => {
    setImages(initialImages);
  }, [initialImages]);

  // Suporte a colar screenshot via Ctrl + V
  useEffect(() => {
    function handlePaste(e: ClipboardEvent) {
      if (!e.clipboardData) return;
      const items = e.clipboardData.items;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const blob = items[i].getAsFile();
          if (blob) {
            const file = new File([blob], `screenshot_trade_${Date.now()}.png`, { type: blob.type });
            handleFile(file);
          }
        }
      }
    }

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [tradeId, date]);

  async function handleFile(file: File) {
    if (!file.type.startsWith('image/')) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      formData.append('tradeId', tradeId);
      formData.append('date', date);
      await uploadTradeImage(formData);
      onUploaded?.();
    } finally {
      setUploading(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  async function executeDelete(imageId: string) {
    setDeletingId(imageId);
    setConfirmDeleteId(null);

    // Otimista: remove do estado local na hora
    setImages(prev => prev.filter(img => img.id !== imageId));
    if (selectedImage?.id === imageId) setSelectedImage(null);

    try {
      const res = await deleteTradeImage(imageId);
      console.log('Exclusão de imagem concluída:', res);
      onUploaded?.();
    } catch (err) {
      console.error('Erro ao deletar imagem:', err);
      // Reverte se der erro
      setImages(initialImages);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
          📸 Screenshots ({images.length})
        </span>
      </div>

      {/* Grid de Imagens */}
      {images.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {images.map((img) => (
            <div
              key={img.id}
              className="relative group bg-slate-950 rounded-lg border border-slate-800 overflow-hidden hover:border-slate-600 transition-all flex flex-col"
            >
              {/* Thumbnail */}
              <div
                className="relative aspect-video cursor-pointer overflow-hidden bg-slate-900"
                onClick={() => setSelectedImage(img)}
              >
                <img
                  src={`/api/files/${img.filePath}`}
                  alt={img.caption || 'Screenshot do trade'}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-xs text-slate-200 font-medium">
                  🔍 Expandir
                </div>
              </div>

              {/* Bar com legenda e confirmação inline */}
              <div className="p-2 bg-slate-900/90 border-t border-slate-800/80">
                {confirmDeleteId === img.id ? (
                  <div className="flex items-center justify-between gap-1 animate-in fade-in">
                    <button
                      onClick={(e) => { e.stopPropagation(); executeDelete(img.id); }}
                      disabled={deletingId === img.id}
                      className="flex-1 py-1 px-2 bg-rose-600 hover:bg-rose-500 text-white rounded text-[10px] font-bold transition-all text-center"
                    >
                      {deletingId === img.id ? 'Deletando...' : 'Confirmar Deletar'}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null); }}
                      className="p-1 text-slate-400 hover:text-slate-200 text-[10px]"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[10px] text-slate-400 truncate flex-1" title={img.caption || ''}>
                      {img.caption || 'Screenshot'}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setConfirmDeleteId(img.id);
                      }}
                      title="Deletar imagem"
                      className="p-1 rounded text-rose-400 hover:text-rose-300 hover:bg-rose-500/20 transition-all text-xs font-bold shrink-0"
                    >
                      🗑️
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Dropzone para Upload */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`flex items-center justify-center gap-2 rounded-lg border border-dashed py-3 px-4 cursor-pointer transition-all text-xs ${
          isDragging
            ? 'border-emerald-400 bg-emerald-400/5'
            : 'border-slate-700/50 hover:border-slate-500 text-slate-500'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          className="hidden"
        />
        {uploading ? (
          <span className="animate-spin">⏳ Fazendo upload...</span>
        ) : (
          <>📷 Arrastar imagem aqui ou clique para selecionar</>
        )}
      </div>

      {/* Modal Expandido */}
      {selectedImage && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setSelectedImage(null)}
        >
          <div
            className="relative max-w-5xl max-h-[90vh] bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-3">
              <span className="text-sm text-slate-300 font-medium truncate">
                {selectedImage.caption || 'Visualização do Screenshot'}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => executeDelete(selectedImage.id)}
                  disabled={deletingId === selectedImage.id}
                  className="px-3 py-1.5 bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/30 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5"
                >
                  🗑️ {deletingId === selectedImage.id ? 'Deletando...' : 'Deletar Imagem'}
                </button>
                <button
                  onClick={() => setSelectedImage(null)}
                  className="text-slate-400 hover:text-slate-200 text-lg px-2"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Modal Image */}
            <div className="overflow-auto max-h-[80vh] p-2 flex items-center justify-center bg-black/40">
              <img
                src={`/api/files/${selectedImage.filePath}`}
                alt={selectedImage.caption || 'Screenshot expandido'}
                className="max-w-full max-h-[75vh] object-contain rounded-lg"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
