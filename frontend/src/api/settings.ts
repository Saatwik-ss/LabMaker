import { fetchApi } from './client';

export interface Settings {
  openaiApiKey: string;
  anthropicApiKey: string;
  groqApiKey: string;
  customApiUrl: string;
  systemPrompt: string;
}

const SETTINGS_KEY = 'codex_settings';

export const getSettings = (): Settings => {
  const stored = localStorage.getItem(SETTINGS_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {
      // ignore
    }
  }
  return {
    openaiApiKey: '',
    anthropicApiKey: '',
    groqApiKey: '',
    customApiUrl: '',
    systemPrompt: '',
  };
};

export const fetchRemoteSettings = async (): Promise<Settings> => {
  try {
    const remote = await fetchApi<Settings>('/settings');
    const local = getSettings();
    // Prefer non-empty values
    return {
      openaiApiKey: local.openaiApiKey || remote.openaiApiKey || '',
      anthropicApiKey: local.anthropicApiKey || remote.anthropicApiKey || '',
      groqApiKey: local.groqApiKey || remote.groqApiKey || '',
      customApiUrl: local.customApiUrl || remote.customApiUrl || '',
      systemPrompt: local.systemPrompt || remote.systemPrompt || '',
    };
  } catch {
    return getSettings();
  }
};

export const saveSettings = async (settings: Settings): Promise<void> => {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  try {
    await fetchApi('/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  } catch (err) {
    console.warn('Could not sync settings to backend:', err);
  }
};
