'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { uploadSessionImage, deleteTradeImage, getSessionImages, updateTradeImageCaption } from '@/features/images/actions';

interface ImageItem {
  id: string;
  filePath: string;
  caption?: string | null;
}

interface SessionImageDropzoneProps {
  tradingDayId: string;
  date: string;
}

export function SessionImageDropzone({ tradingDayId, date }: SessionImageDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [images, setImages] = useState<ImageItem[]>([]);
  const [selectedImage, setSelectedImage] = useState<ImageItem | null>(null);
  const [editingCaption, setEditingCaption] = useState<string>('');
  const [savingCaption, setSavingCaption] = useState(false);
  const [savedCaptionSuccess, setSavedCaptionSuccess] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [pasteNotification, setPasteNotification] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isPastingRef = useRef(false);

  const loadImages = useCallback(async () => {
    try {
      const data = await getSessionImages(tradingDayId);
      setImages(data);
    } catch (err) {
      console.error('Erro ao carregar imagens da sessão:', err);
    }
  }, [tradingDayId]);

  useEffect(() => {
    loadImages();
  }, [loadImages]);

  useEffect(() => {
    if (selectedImage) {
      setEditingCaption(selectedImage.caption || '');
      setSavedCaptionSuccess(false);
    }
  }, [selectedImage]);

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      formData.append('tradingDayId', tradingDayId);
      formData.append('date', date);

      const newRecord = await uploadSessionImage(formData);

      if (newRecord && newRecord.id) {
        const newImg: ImageItem = {
          id: newRecord.id,
          filePath: newRecord.filePath,
          caption: newRecord.caption || 'Gráfico da Sessão',
        };
        setImages(prev => {
          if (prev.some(img => img.id === newImg.id)) return prev;
          return [...prev, newImg];
        });
      }
    } catch (err) {
      console.error('Erro no upload da imagem da sessão:', err);
    } finally {
      setUploading(false);
    }
  }, [tradingDayId, date]);

  const processClipboardData = useCallback((clipboardData: DataTransfer | null) => {
    if (!clipboardData || isPastingRef.current) return;
    const items = clipboardData.items;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const blob = items[i].getAsFile();
        if (blob) {
          isPastingRef.current = true;
          const timestamp = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          const file = new File([blob], `session_print_${Date.now()}.png`, { type: blob.type || 'image/png' });

          setPasteNotification(`📋 Print do gráfico colado às ${timestamp}!`);

          handleFile(file).finally(() => {
            setTimeout(() => { isPastingRef.current = false; }, 600);
            setTimeout(() => setPasteNotification(null), 3500);
          });
          break;
        }
      }
    }
  }, [handleFile]);

  useEffect(() => {
    function handleGlobalPaste(e: ClipboardEvent) {
      const activeTag = document.activeElement?.tagName.toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || (document.activeElement as HTMLElement)?.isContentEditable) {
        return;
      }
      processClipboardData(e.clipboardData);
    }

    window.addEventListener('paste', handleGlobalPaste);
    return () => window.removeEventListener('paste', handleGlobalPaste);
  }, [processClipboardData]);

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
    setImages(prev => prev.filter(img => img.id !== imageId));
    if (selectedImage?.id === imageId) setSelectedImage(null);

    try {
      await deleteTradeImage(imageId);
    } catch (err) {
      console.error('Erro ao deletar imagem da sessão:', err);
      loadImages();
    } finally {
      setDeletingId(null);
    }
  }

  async function handleSaveCaption() {
    if (!selectedImage) return;
    setSavingCaption(true);
    setSavedCaptionSuccess(false);

    try {
      const res = await updateTradeImageCaption(selectedImage.id, editingCaption);
      const updatedText = res.caption;

      setImages(prev => prev.map(img => img.id === selectedImage.id ? { ...img, caption: updatedText } : img));
      setSelectedImage(prev => prev ? { ...prev, caption: updatedText } : null);

      setSavedCaptionSuccess(true);
      setTimeout(() => setSavedCaptionSuccess(false), 2500);
    } catch (err) {
      console.error('Erro ao salvar descrição do gráfico da sessão:', err);
    } finally {
      setSavingCaption(false);
    }
  }

  return (
    <div className="space-y-3 font-mono">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5 uppercase tracking-wider">
          📸 PRINTS & GRÁFICOS DO PREGÃO ({images.length})
        </span>
        <span className="text-[10px] text-teal-400 bg-teal-500/10 border border-teal-500/20 px-2 py-0.5 rounded font-mono flex items-center gap-1">
          <span>📋</span>
          <span>CTRL + V ATIVO PARA COLAR PRINTS DO DIA</span>
        </span>
      </div>

      {pasteNotification && (
        <div className="px-3 py-1.5 bg-teal-500/20 border border-teal-500/40 rounded-lg text-xs text-teal-300 font-mono flex items-center gap-2 animate-in fade-in">
          <span>✨</span>
          <span>{pasteNotification}</span>
        </div>
      )}

      {/* Grid de Imagens da Sessão */}
      {images.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {images.map((img) => (
            <div
              key={img.id}
              className="relative group bg-[#070a10] rounded-lg border border-slate-800 overflow-hidden hover:border-teal-500/50 transition-all flex flex-col"
            >
              <div
                className="relative aspect-video cursor-pointer overflow-hidden bg-slate-950"
                onClick={() => setSelectedImage(img)}
              >
                <img
                  src={`/api/files/${img.filePath}`}
                  alt={img.caption || 'Gráfico da sessão'}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-slate-950/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-xs text-teal-300 font-medium">
                  🔍 Expandir / Editar
                </div>
              </div>

              <div className="p-2 bg-[#0b1018] border-t border-slate-800/80">
                {confirmDeleteId === img.id ? (
                  <div className="flex items-center justify-between gap-1 animate-in fade-in">
                    <button
                      onClick={(e) => { e.stopPropagation(); executeDelete(img.id); }}
                      disabled={deletingId === img.id}
                      className="flex-1 py-1 px-2 bg-rose-600 hover:bg-rose-500 text-white rounded text-[10px] font-bold transition-all text-center"
                    >
                      {deletingId === img.id ? 'Deletando...' : 'Confirmar'}
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
                    <span className="text-[10px] text-slate-400 truncate flex-1 font-mono" title={img.caption || ''}>
                      {img.caption || 'Sem descrição'}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setConfirmDeleteId(img.id);
                      }}
                      title="Deletar print"
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

      {/* Area de Drop / Ctrl + V */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`flex flex-col sm:flex-row items-center justify-center gap-2 rounded-lg border border-dashed py-4 px-4 cursor-pointer transition-all text-xs outline-none ${
          isDragging
            ? 'border-teal-400 bg-teal-400/10 scale-[1.01]'
            : 'border-slate-800 hover:border-teal-500/50 bg-[#070a10] text-slate-400 hover:text-slate-200 focus:border-teal-500/60'
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
          <span className="animate-spin text-teal-400 font-bold flex items-center gap-2">
            ⏳ Salvando print do gráfico...
          </span>
        ) : (
          <div className="flex items-center gap-2 flex-wrap justify-center text-center">
            <span className="text-base">📸</span>
            <span>Arrastar gráfico do dia aqui, clicar para selecionar ou <strong className="text-teal-400 underline decoration-teal-500/40">pressionar Ctrl + V</strong> para colar screenshot do pregão</span>
          </div>
        )}
      </div>

      {/* Modal Expandido com Edição de Legenda/Descrição Abaixo da Imagem */}
      {selectedImage && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setSelectedImage(null)}
        >
          <div
            className="relative max-w-5xl w-full max-h-[92vh] bg-[#0b1018] border border-slate-800 rounded-xl overflow-hidden shadow-2xl flex flex-col font-mono"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-3 bg-[#070a10] border-b border-slate-800 flex items-center justify-between gap-3">
              <span className="text-xs text-slate-300 font-bold tracking-wider uppercase flex items-center gap-2">
                <span>📸</span>
                <span>Gráfico da Sessão</span>
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => executeDelete(selectedImage.id)}
                  disabled={deletingId === selectedImage.id}
                  className="px-3 py-1 bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/30 rounded text-xs font-bold transition-all flex items-center gap-1.5"
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

            <div className="overflow-auto max-h-[55vh] p-3 flex items-center justify-center bg-black/70 border-b border-slate-800/80">
              <img
                src={`/api/files/${selectedImage.filePath}`}
                alt="Gráfico da sessão"
                className="max-w-full max-h-[50vh] object-contain rounded-lg shadow-2xl"
              />
            </div>

            {/* Seção de Anotação/Descrição Editável ABAIXO DA IMAGEM */}
            <div className="p-4 bg-[#070a10] space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] text-teal-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                  <span>📝</span>
                  <span>DESCRIÇÃO & EXPLICAÇÃO TÉCNICA DESTE GRÁFICO</span>
                </label>
                <span className="text-[10px] text-slate-500 font-sans">
                  Escreva e edite livremente sua observação sobre esta imagem
                </span>
              </div>

              <textarea
                value={editingCaption}
                onChange={(e) => setEditingCaption(e.target.value)}
                placeholder="Escreva sua observação técnica sobre este gráfico do pregão..."
                className="w-full h-24 bg-[#0b1018] border border-slate-700/80 rounded-lg p-3 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-teal-500/60 font-mono leading-relaxed"
              />

              <div className="flex items-center justify-between pt-1">
                {savedCaptionSuccess ? (
                  <span className="text-xs text-teal-400 font-bold flex items-center gap-1">
                    ✓ Descrição salva com sucesso no banco SQLite!
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-500 font-sans">
                    Salva permanentemente no banco SQLite do diário
                  </span>
                )}

                <button
                  type="button"
                  onClick={handleSaveCaption}
                  disabled={savingCaption}
                  className="px-4 py-1.5 bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs rounded-md transition-all flex items-center gap-1.5 disabled:opacity-50 font-mono uppercase"
                >
                  {savingCaption ? 'SALVANDO...' : '💾 SALVAR DESCRIÇÃO'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SessionImageDropzone;
