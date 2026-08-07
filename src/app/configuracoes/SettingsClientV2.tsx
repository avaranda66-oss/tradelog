'use client';

import { useState } from 'react';

export function SettingsClientV2() {
  const [activeTab, setActiveTab] = useState<'geral' | 'armazenamento' | 'backup'>('geral');
  const [saved, setSaved] = useState(false);

  const [settings, setSettings] = useState({
    mainAsset: 'WINFUT',
    timezone: 'America/Sao_Paulo',
    currency: 'BRL (R$)',
    priceFormat: '1.234,56 (Brasileiro)',
    confirmOnDelete: true,
    autoSave: true,
  });

  function handleSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-6">
      {/* Sidebar de Abas de Configurações */}
      <div className="bg-[#0d131f] border border-slate-800 rounded-xl p-2 space-y-1 h-fit">
        {[
          { id: 'geral', label: '⚙️ Geral', desc: 'Ativo, Moeda, Fuso' },
          { id: 'armazenamento', label: '📁 Armazenamento', desc: 'Pastas locais de mídia' },
          { id: 'backup', label: '💾 Backup & Dados', desc: 'Exportar banco SQLite' },
        ].map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id as any)}
            className={`w-full text-left p-3 rounded-lg text-xs transition-all ${
              activeTab === item.id
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <div className="font-medium text-slate-200">{item.label}</div>
            <div className="text-[10px] text-slate-500 mt-0.5">{item.desc}</div>
          </button>
        ))}
      </div>

      {/* Conteúdo Principal de Configurações */}
      <div className="bg-[#0d131f] border border-slate-800 rounded-xl p-6 space-y-6">
        {activeTab === 'geral' && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-200 border-b border-slate-800 pb-2">Preferências Gerais</h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Ativo Principal</label>
                <input
                  value={settings.mainAsset}
                  onChange={(e) => setSettings({ ...settings, mainAsset: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Fuso Horário</label>
                <input
                  value={settings.timezone}
                  disabled
                  className="w-full bg-slate-900/50 border border-slate-800/80 rounded-lg px-3 py-2 text-sm text-slate-500"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Moeda</label>
                <input
                  value={settings.currency}
                  disabled
                  className="w-full bg-slate-900/50 border border-slate-800/80 rounded-lg px-3 py-2 text-sm text-slate-500"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Formato de Preço</label>
                <input
                  value={settings.priceFormat}
                  disabled
                  className="w-full bg-slate-900/50 border border-slate-800/80 rounded-lg px-3 py-2 text-sm text-slate-500"
                />
              </div>
            </div>

            <div className="pt-2 space-y-3">
              <label className="flex items-center gap-3 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.confirmOnDelete}
                  onChange={(e) => setSettings({ ...settings, confirmOnDelete: e.target.checked })}
                  className="rounded border-slate-700 bg-slate-900 text-emerald-500"
                />
                <span>Pedir confirmação antes de excluir fotos ou transcrições</span>
              </label>

              <label className="flex items-center gap-3 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.autoSave}
                  onChange={(e) => setSettings({ ...settings, autoSave: e.target.checked })}
                  className="rounded border-slate-700 bg-slate-900 text-emerald-500"
                />
                <span>Salvar anotações do pré-market automaticamente ao digitar</span>
              </label>
            </div>
          </div>
        )}

        {activeTab === 'armazenamento' && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-200 border-b border-slate-800 pb-2">Caminhos de Armazenamento Local</h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-400 block mb-1">Pasta de Áudios Gravados</label>
                <div className="flex gap-2">
                  <input
                    value="d:\estudos\tradelog\data\audio"
                    readOnly
                    className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-slate-300 font-mono text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Pasta de Screenshots e Frames OBS</label>
                <div className="flex gap-2">
                  <input
                    value="d:\estudos\tradelog\data\images"
                    readOnly
                    className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-slate-300 font-mono text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Arquivo do Banco de Dados SQLite</label>
                <div className="flex gap-2">
                  <input
                    value="d:\estudos\tradelog\data\tradelog.db"
                    readOnly
                    className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-slate-300 font-mono text-xs"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'backup' && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-200 border-b border-slate-800 pb-2">Backup & Exportação</h3>
            <p className="text-xs text-slate-400">
              Todos os seus dados estão seguros localmente na pasta <code className="text-emerald-400">/data</code>.
            </p>
          </div>
        )}

        {/* Botão de Salvar Alterações */}
        <div className="flex items-center gap-3 border-t border-slate-800 pt-4">
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-emerald-500 text-slate-950 rounded-lg text-xs font-bold hover:bg-emerald-400 transition-all shadow-md"
          >
            Salvar Alterações
          </button>
          {saved && <span className="text-xs text-emerald-400 animate-in fade-in">✅ Alterações salvas!</span>}
        </div>
      </div>
    </div>
  );
}
