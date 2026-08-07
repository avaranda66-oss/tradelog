import { SettingsClientV2 } from './SettingsClientV2';

export const dynamic = 'force-dynamic';

export default async function ConfiguracoesPage() {
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
          ⚙️ Configurações do Sistema
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Gerencie preferências locais, formato de preço, atalhos, banco SQLite e pastas de armazenamento
        </p>
      </div>

      <SettingsClientV2 />
    </div>
  );
}
