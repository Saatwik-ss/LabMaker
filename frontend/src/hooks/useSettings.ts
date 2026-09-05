import { useState, useEffect } from 'react';
import { Settings, getSettings, saveSettings, fetchRemoteSettings } from '../api/settings';

export const useSettings = () => {
  const [settings, setSettingsState] = useState<Settings>(getSettings());

  useEffect(() => {
    fetchRemoteSettings().then(setSettingsState);
  }, []);

  const updateSettings = async (newSettings: Partial<Settings>) => {
    const updated = { ...settings, ...newSettings };
    setSettingsState(updated);
    await saveSettings(updated);
  };

  return { settings, updateSettings };
};
