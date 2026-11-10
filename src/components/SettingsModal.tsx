import type { Dispatch, SetStateAction } from "react";
import { Monitor, Moon, Sun, X } from "lucide-react";

interface ProviderInfo {
  id: string;
  name: string;
  models: string[];
  defaultModel: string;
}

interface AppSettings {
  theme: "light" | "dark" | "system";
  fontSize: "small" | "medium" | "large";
  maxResults: number;
  provider: string;
  model: string;
  apiKey: string;
}

interface SettingsModalProps {
  open: boolean;
  settings: AppSettings;
  providers: ProviderInfo[];
  onClose: () => void;
  setSettings: Dispatch<SetStateAction<AppSettings>>;
  onSave: () => void;
}

export function SettingsModal({
  open,
  settings,
  providers,
  onClose,
  setSettings,
  onSave,
}: SettingsModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white dark:bg-[#1e293b] rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 border border-slate-200 dark:border-slate-700"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">设置</h2>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-all duration-200"
            aria-label="关闭设置"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mb-5">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block">主题</label>
          <div className="flex gap-2">
            {([
              { value: "light", label: "亮色", icon: Sun },
              { value: "dark", label: "暗色", icon: Moon },
              { value: "system", label: "跟随系统", icon: Monitor },
            ] as const).map((opt) => {
              const Icon = opt.icon;
              return (
                <button
                  key={opt.value}
                  onClick={() => setSettings((s) => ({ ...s, theme: opt.value }))}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all duration-200 ${
                    settings.theme === opt.value
                      ? "bg-blue-50 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-500/30"
                      : "bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mb-5">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block">字体大小</label>
          <div className="flex gap-2">
            {([
              { value: "small", label: "小" },
              { value: "medium", label: "中" },
              { value: "large", label: "大" },
            ] as const).map((opt) => (
              <button
                key={opt.value}
                onClick={() => setSettings((s) => ({ ...s, fontSize: opt.value }))}
                className={`flex-1 px-3 py-2 rounded-xl text-xs font-medium transition-all duration-200 ${
                  settings.fontSize === opt.value
                    ? "bg-blue-50 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-500/30"
                    : "bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-5">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block">每次查询最大结果数</label>
          <div className="flex gap-2">
            {[10, 30, 50, 100].map((n) => (
              <button
                key={n}
                onClick={() => setSettings((s) => ({ ...s, maxResults: n }))}
                className={`flex-1 px-3 py-2 rounded-xl text-xs font-medium transition-all duration-200 ${
                  settings.maxResults === n
                    ? "bg-blue-50 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-500/30"
                    : "bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div className="border-t border-slate-200 dark:border-slate-700 my-5" />

        <div className="mb-5">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block">AI 模型提供商</label>
          <select
            value={settings.provider}
            onChange={(e) => {
              const p = providers.find((x) => x.id === e.target.value);
              setSettings((s) => ({ ...s, provider: e.target.value, model: p?.defaultModel || s.model, apiKey: "" }));
            }}
            className="w-full px-3 py-2 rounded-xl text-sm border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            {providers.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div className="mb-5">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block">模型</label>
          <select
            value={settings.model}
            onChange={(e) => setSettings((s) => ({ ...s, model: e.target.value }))}
            className="w-full px-3 py-2 rounded-xl text-sm border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            {(providers.find((p) => p.id === settings.provider)?.models || []).map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        <div className="mb-6">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block">API Key</label>
          <input
            type="password"
            value={settings.apiKey}
            onChange={(e) => setSettings((s) => ({ ...s, apiKey: e.target.value }))}
            placeholder={`输入 ${providers.find((p) => p.id === settings.provider)?.name || ""} API Key`}
            className="w-full px-3 py-2 rounded-xl text-sm border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5">
            API Key 会保存在浏览器本地；发起请求时会经由本应用服务端转发到所选模型提供商，服务端不做持久化保存
          </p>
        </div>

        <div className={`flex items-center gap-2 mb-4 px-3 py-2 rounded-xl text-xs ${
          settings.apiKey
            ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20"
            : "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20"
        }`}>
          <div className={`w-2 h-2 rounded-full ${settings.apiKey ? "bg-emerald-500" : "bg-amber-500"}`} />
          {settings.apiKey
            ? `已配置 ${providers.find((p) => p.id === settings.provider)?.name} · ${settings.model}`
            : "未配置 API Key，请先填入后保存"}
        </div>

        <button
          onClick={onSave}
          className="w-full py-2.5 rounded-xl text-sm font-medium bg-gradient-to-r from-blue-500 to-cyan-500 text-white hover:from-blue-600 hover:to-cyan-600 transition-all duration-200 shadow-sm"
        >
          保存设置
        </button>
      </div>
    </div>
  );
}
