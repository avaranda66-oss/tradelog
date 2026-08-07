'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { saveAudioRecording, transcribeAudioRecord } from '@/features/audio/actions';

interface AudioRecorderProps {
  date: string;
  onRecorded?: () => void;
}

export function AudioRecorder({ date, onRecorded }: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'transcribing' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [duration, setDuration] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Limpa tudo ao desmontar
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
      audioCtxRef.current?.close();
    };
  }, []);

  const drawLiveWaveform = useCallback(() => {
    const analyser = analyserRef.current;
    const canvas = canvasRef.current;
    if (!analyser || !canvas) return;

    const ctx = canvas.getContext('2d')!;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animationFrameRef.current = requestAnimationFrame(draw);
      analyser.getByteTimeDomainData(dataArray);

      ctx.fillStyle = '#020617';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.lineWidth = 2;
      ctx.strokeStyle = '#22c55e';
      ctx.beginPath();

      const sliceWidth = canvas.width / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * canvas.height) / 2;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        x += sliceWidth;
      }
      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();
    };

    draw();
  }, []);

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      audioCtxRef.current = new AudioContext();
      analyserRef.current = audioCtxRef.current.createAnalyser();
      analyserRef.current.fftSize = 2048;
      sourceRef.current = audioCtxRef.current.createMediaStreamSource(stream);
      sourceRef.current.connect(analyserRef.current);

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      mediaRecorderRef.current = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorderRef.current.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);

        // Salva automaticamente
        setStatus('saving');
        setMessage('Salvando áudio...');

        try {
          const formData = new FormData();
          formData.append('audio', blob, 'narration.webm');
          formData.append('date', date);
          const result = await saveAudioRecording(formData);

          setStatus('transcribing');
          setMessage('🤖 Transcrevendo com Gemini...');

          try {
            const transcription = await transcribeAudioRecord(result.id);
            setStatus('done');
            setMessage('✅ Transcrição concluída!');
            onRecorded?.();
          } catch {
            setStatus('done');
            setMessage('⚠️ Áudio salvo, mas falha na transcrição. Tente novamente depois.');
            onRecorded?.();
          }
        } catch (err) {
          setStatus('error');
          setMessage(`❌ Erro: ${err instanceof Error ? err.message : 'Falha ao salvar'}`);
        }
      };

      mediaRecorderRef.current.start(1000); // chunks a cada 1s
      setIsRecording(true);
      setDuration(0);
      setAudioUrl(null);
      setStatus('idle');
      setMessage('');

      // Timer de duração
      timerRef.current = setInterval(() => {
        setDuration(d => d + 1);
      }, 1000);

      drawLiveWaveform();
    } catch (err) {
      setMessage('❌ Permissão de microfone negada');
      setStatus('error');
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);

    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (timerRef.current) clearInterval(timerRef.current);

    streamRef.current?.getTracks().forEach(t => t.stop());
    analyserRef.current?.disconnect();
    sourceRef.current?.disconnect();
    audioCtxRef.current?.close();
  }

  function formatDuration(secs: number): string {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  return (
    <div className="bg-slate-900/50 border border-slate-800/50 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
          🎙️ Narração de Voz
        </h3>
        <div className="flex items-center gap-3">
          {isRecording && (
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-sm font-mono text-red-400">{formatDuration(duration)}</span>
              <span className="text-xs text-slate-500">~{((duration * 8) / 1024).toFixed(1)} MB</span>
            </div>
          )}
        </div>
      </div>

      {/* Waveform Canvas */}
      <canvas
        ref={canvasRef}
        width={600}
        height={80}
        className="w-full rounded-lg bg-slate-950 border border-slate-800/30"
      />

      {/* Controls */}
      <div className="flex items-center gap-3">
        {!isRecording ? (
          <button
            onClick={startRecording}
            disabled={status === 'saving' || status === 'transcribing'}
            className="flex items-center gap-2 px-4 py-2.5 bg-red-500/10 text-red-400 rounded-lg text-sm font-medium hover:bg-red-500/20 transition-all disabled:opacity-50 border border-red-500/20"
          >
            <span className="w-3 h-3 rounded-full bg-red-500" />
            Gravar
          </button>
        ) : (
          <button
            onClick={stopRecording}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-700 text-slate-200 rounded-lg text-sm font-medium hover:bg-slate-600 transition-all border border-slate-600"
          >
            <span className="w-3 h-3 rounded-sm bg-slate-300" />
            Parar
          </button>
        )}

        {audioUrl && (
          <audio controls src={audioUrl} className="flex-1 h-10 [&::-webkit-media-controls-panel]:bg-slate-800" />
        )}
      </div>

      {/* Status */}
      {message && (
        <div className={`px-3 py-2 rounded-lg text-xs font-medium animate-in fade-in ${
          status === 'error' ? 'bg-red-500/10 text-red-400' :
          status === 'done' ? 'bg-emerald-500/10 text-emerald-400' :
          'bg-blue-500/10 text-blue-400'
        }`}>
          {(status === 'saving' || status === 'transcribing') && (
            <span className="inline-block animate-spin mr-1">⏳</span>
          )}
          {message}
        </div>
      )}

      {/* Info de limites */}
      <div className="flex items-center gap-4 text-[10px] text-slate-600">
        <span>Inline: até ~25 min (14 MB)</span>
        <span>•</span>
        <span>Files API: até 8.4h (2 GB)</span>
        <span>•</span>
        <span>Custo: ~$0.007/min</span>
        <span>•</span>
        <span>Auto-detecta método por tamanho</span>
      </div>
    </div>
  );
}
