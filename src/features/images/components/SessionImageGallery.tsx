'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { getSessionImages, uploadSessionImage, deleteTradeImage, updateTradeImageCaption, analyzeImageWithVision } from '@/features/images/actions';

interface ImageItem {
  id: string;
  filePath: string;
  caption?: string | null;
  imageType?: string | null;
  tradeId?: string | null;
  tradeNumber?: number | null;
  tradeSide?: string | null;
  tradePoints?: number | null;
  createdAt?: string | null;
}

interface SessionImageGalleryProps {
  tradingDayId: string;
  date: string;
}

export function SessionImageGallery({ tradingDayId, date }: SessionImageGalleryProps) {
  const [images, setImages] = useState<ImageItem[]>([]);
  const [selectedImage, setSelectedImage] = useState<ImageItem | null>(null);
  const [activeFilter, setActiveFilter] = useState<'all' | 'trades' | 'farol' | 'session'>('all');
  const [editingCaption, setEditingCaption] = useState<string>('');
  const [savingCaption, setSavingCaption] = useState(false);
  const [savedCaptionSuccess, setSavedCaptionSuccess] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [analyzingAi, setAnalyzingAi] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadImages = useCallback(async () => {
    try {
      const data = await getSessionImages(tradingDayId);
      setImages(data);
    } catch (err) {
      console.error('Erro ao carregar prints da sessão:', err);
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

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      formData.append('tradingDayId', tradingDayId);
      formData.append('date', date);

      await uploadSessionImage(formData);
      await loadImages();
    } catch (err) {
      console.error('Erro ao fazer upload da imagem de sessão:', err);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function executeDelete(imageId: string) {
    setDeletingId(imageId);
    setConfirmDeleteId(null);
    setImages(prev => prev.filter(img => img.id !== imageId));
    if (selectedImage?.id === imageId) setSelectedImage(null);

    try {
      await deleteTradeImage(imageId);
    } catch (err) {
      console.error('Erro ao deletar print da sessão:', err);
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
      console.error('Erro ao salvar legenda do print:', err);
    } finally {
      setSavingCaption(false);
    }
  }

  async function handleAnalyzeAi() {
    if (!selectedImage) return;
    setAnalyzingAi(true);
    try {
      const res = await analyzeImageWithVision(selectedImage.id);
      if (res && res.caption) {
        setEditingCaption(res.caption);
        setImages(prev => prev.map(img => img.id === selectedImage.id ? { ...img, caption: res.caption } : img));
        setSelectedImage(prev => prev ? { ...prev, caption: res.caption } : null);
      }
    } catch (err) {
      console.error('Erro ao analisar imagem via Vision AI:', err);
    } finally {
      setAnalyzingAi(false);
    }
  }

  const tradeImagesList = images.filter(img => Boolean(img.tradeId) || img.imageType?.includes('video-') || img.imageType === 'entrada' || img.imageType === 'saida');
  const farolImagesList = images.filter(img => img.imageType?.startsWith('farol-') || img.filePath.includes('/farol/'));
  const sessionImagesList = images.filter(img => img.imageType === 'session' || (!tradeImagesList.includes(img) && !farolImagesList.includes(img)));

  const filteredImages = activeFilter === 'trades'
    ? tradeImagesList
    : activeFilter === 'farol'
    ? farolImagesList
    : activeFilter === 'session'
    ? sessionImagesList
    : images;

  function getImageBadge(img: ImageItem) {
    if (img.tradeNumber) {
      const sideText = img.tradeSide === 'C' ? 'COMPRA' : 'VENDA';
      const sideColor = img.tradeSide === 'C' ? 'text-teal-300 border-teal-500/30 bg-teal-500/10' : 'text-rose-300 border-rose-500/30 bg-rose-500/10';
      const typeText = img.imageType === 'video-entry' ? 'ENTRADA' : img.imageType === 'video-exit' ? 'SAÍDA' : img.imageType === 'video-before' ? 'PRÉ-TRADE' : 'TRADE';
      return {
        label: `#${img.tradeNumber} [${sideText}] ${typeText}`,
        color: sideColor,
        icon: '🎯',
      };
    }

    if (img.imageType?.startsWith('farol-') || img.filePath.includes('/farol/')) {
      const farolType = img.imageType === 'farol-briefing' ? 'BRIEFING' : img.imageType === 'farol-gps' ? 'GPS' : img.imageType === 'farol-radar' ? 'RADAR' : 'FAROL';
      return {
        label: `FAROL DO MERCADO (${farolType})`,
        color: 'text-cyan-300 border-cyan-500/30 bg-cyan-500/10',
        icon: '🧭',
      };
    }

    return {
      label: 'POST-SESSION DEBRIEF',
      color: 'text-amber-300 border-amber-500/30 bg-amber-500/10',
      icon: '📸',
    };
  }

  return (
    <div className="bg-[#0b1018] border border-slate-800/80 rounded-2xl p-4 shadow-xl font-mono space-y-4">
      {/* Header Principal com Filtros e Upload */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm">📸</span>
          <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
            PRINTS DO PREGÃO & DEBRIEF DA SESSÃO ({images.length})
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Botão de Upload Manual de Print */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept="image/*"
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded text-[10px] font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <span>➕</span>
            <span>{isUploading ? 'ANEXANDO...' : 'ANEXAR NOVO PRINT'}</span>
          </button>
        </div>
      </div>

      {/* Abas de Filtro de Categoria */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <button
          type="button"
          onClick={() => setActiveFilter('all')}
          className={`px-3 py-1 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1 cursor-pointer ${
            activeFilter === 'all'
              ? 'bg-teal-500 text-slate-950 shadow-md'
              : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
          }`}
        >
          <span>🌟 TODOS</span>
          <span className="opacity-80">({images.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveFilter('trades')}
          className={`px-3 py-1 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1 cursor-pointer ${
            activeFilter === 'trades'
              ? 'bg-teal-500 text-slate-950 shadow-md'
              : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
          }`}
        >
          <span>🎯 TRADES & ENTRADAS</span>
          <span className="opacity-80">({tradeImagesList.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveFilter('farol')}
          className={`px-3 py-1 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1 cursor-pointer ${
            activeFilter === 'farol'
              ? 'bg-teal-500 text-slate-950 shadow-md'
              : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
          }`}
        >
          <span>🧭 FAROL DO MERCADO</span>
          <span className="opacity-80">({farolImagesList.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveFilter('session')}
          className={`px-3 py-1 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1 cursor-pointer ${
            activeFilter === 'session'
              ? 'bg-teal-500 text-slate-950 shadow-md'
              : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
          }`}
        >
          <span>📸 POST-SESSION</span>
          <span className="opacity-80">({sessionImagesList.length})</span>
        </button>
      </div>

      {/* Caso vazio no filtro selecionado */}
      {filteredImages.length === 0 ? (
        <div className="p-6 text-center border border-dashed border-slate-800 rounded-xl space-y-2">
          <p className="text-xs text-slate-400 font-sans">
            Nenhum print encontrado nesta categoria ({activeFilter}).
          </p>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="text-[11px] text-teal-400 hover:underline font-bold"
          >
            + Clique aqui para anexar um print manualmente
          </button>
        </div>
      ) : (
        /* Grid de Cards dos Prints */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredImages.map((img, idx) => {
            const badge = getImageBadge(img);

            return (
              <div
                key={img.id}
                className="group bg-[#070a10] rounded-xl border border-slate-800/90 hover:border-teal-500/60 overflow-hidden shadow-lg transition-all duration-200 flex flex-col"
              >
                {/* Thumbnail com Proporção Expandida e Efeito Hover */}
                <div
                  className="relative aspect-[16/10] cursor-pointer overflow-hidden bg-slate-950"
                  onClick={() => setSelectedImage(img)}
                >
                  <img
                    src={`/api/files/${img.filePath.replace(/\\/g, '/')}?v=${img.id}`}
                    alt={img.caption || `Print #${idx + 1}`}
                    className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1 p-2 text-center">
                    <span className="text-sm">🔍</span>
                    <span className="text-xs font-bold text-teal-300 font-mono">
                      EXPANDIR PRINT
                    </span>
                    <span className="text-[9px] text-slate-400 font-sans">Clique para visualizar e anotar</span>
                  </div>

                  {/* Badge Top Left */}
                  <div className={`absolute top-2 left-2 border backdrop-blur-md px-2 py-0.5 rounded text-[8px] font-bold font-mono flex items-center gap-1 ${badge.color}`}>
                    <span>{badge.icon}</span>
                    <span>{badge.label}</span>
                  </div>
                </div>

                {/* Rodapé / Legenda do Card */}
                <div className="p-2.5 bg-[#0b1018] border-t border-slate-800/80 flex items-center justify-between gap-2">
                  <p className="text-xs text-slate-300 font-sans truncate flex-1" title={img.caption || badge.label}>
                    {img.caption || badge.label}
                  </p>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedImage(img);
                    }}
                    className="text-[10px] bg-slate-800 hover:bg-slate-700 text-teal-300 px-2 py-1 rounded font-mono font-bold transition-colors shrink-0 cursor-pointer"
                  >
                    AMPLIAR 🔍
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de Zoom do Print com Descrição e IA */}
      {selectedImage && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setSelectedImage(null)}
        >
          <div
            className="relative max-w-5xl w-full max-h-[92vh] bg-[#0b1018] border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col font-mono"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header Modal */}
            <div className="p-3.5 bg-[#070a10] border-b border-slate-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm">📸</span>
                <span className="text-xs text-slate-200 font-bold tracking-wider uppercase">
                  {selectedImage.caption || 'Print do Pregão'} · {date}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => executeDelete(selectedImage.id)}
                  disabled={deletingId === selectedImage.id}
                  className="px-3 py-1 bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/30 rounded text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  🗑️ {deletingId === selectedImage.id ? 'Deletando...' : 'Excluir Print'}
                </button>
                <button
                  onClick={() => setSelectedImage(null)}
                  className="text-slate-400 hover:text-slate-200 text-lg px-2 cursor-pointer"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Imagem Expandida com Rolagem Vertical Suave */}
            <div className="overflow-auto max-h-[58vh] p-3 flex items-center justify-center bg-black/90 border-b border-slate-800/80">
              <img
                src={`/api/files/${selectedImage.filePath.replace(/\\/g, '/')}?v=${selectedImage.id}`}
                alt="Gráfico ampliado"
                className="max-w-full max-h-[54vh] object-contain rounded-lg shadow-2xl"
              />
            </div>

            {/* Edição de Descrição Abaixo da Imagem */}
            <div className="p-4 bg-[#070a10] space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] text-teal-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                  <span>📝</span>
                  <span>DESCRIÇÃO & ANOTAÇÃO TÉCNICA DESTE GRÁFICO</span>
                </label>
                <span className="text-[10px] text-slate-500 font-sans">
                  Sincronizado permanentemente no banco SQLite
                </span>
              </div>

              <textarea
                value={editingCaption}
                onChange={(e) => setEditingCaption(e.target.value)}
                placeholder="Escreva sua observação técnica sobre este gráfico da sessão..."
                className="w-full h-20 bg-[#0b1018] border border-slate-700/80 rounded-lg p-2.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-teal-500/60 font-mono leading-relaxed"
              />

              <div className="flex items-center justify-between pt-1">
                {savedCaptionSuccess ? (
                  <span className="text-xs text-teal-400 font-bold flex items-center gap-1">
                    ✓ Descrição salva com sucesso!
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-500 font-sans">
                    Salva no banco SQLite
                  </span>
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleAnalyzeAi}
                    disabled={analyzingAi}
                    className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-bold text-xs rounded-md transition-all flex items-center gap-1.5 disabled:opacity-50 font-mono uppercase cursor-pointer"
                  >
                    {analyzingAi ? '🤖 ANALISANDO IA...' : '✨ ANALISAR COM IA (GEMINI)'}
                  </button>

                  <button
                    type="button"
                    onClick={handleSaveCaption}
                    disabled={savingCaption}
                    className="px-4 py-1.5 bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs rounded-md transition-all flex items-center gap-1.5 disabled:opacity-50 font-mono uppercase cursor-pointer"
                  >
                    {savingCaption ? 'SALVANDO...' : '💾 SALVAR DESCRIÇÃO'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SessionImageGallery;
