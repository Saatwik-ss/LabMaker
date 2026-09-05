import { useState, useEffect, useCallback } from 'react';
import { getModules, installModule as apiInstallModule, uninstallModule as apiUninstallModule, ModuleTemplate } from '../api/modules';

export const useModules = () => {
  const [modules, setModules] = useState<ModuleTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadModules = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getModules();
      setModules(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load modules');
    } finally {
      setLoading(false);
    }
  }, []);

  const install = async (id: string, variantId: string, config: Record<string, any> = {}) => {
    setActionLoading(id);
    try {
      const res = await apiInstallModule(id, variantId, config);
      await loadModules();
      return res;
    } catch (err: any) {
      setError(err.message || `Failed to install module ${id}`);
      throw err;
    } finally {
      setActionLoading(null);
    }
  };

  const uninstall = async (id: string) => {
    setActionLoading(id);
    try {
      const res = await apiUninstallModule(id);
      await loadModules();
      return res;
    } catch (err: any) {
      setError(err.message || `Failed to uninstall module ${id}`);
      throw err;
    } finally {
      setActionLoading(null);
    }
  };

  useEffect(() => {
    loadModules();
  }, [loadModules]);

  return { modules, loading, actionLoading, error, reload: loadModules, install, uninstall };
};
