import { useState, useEffect, useCallback } from 'react';
import { getModel, getModelSummary, discoverProject as apiDiscoverProject, ApplicationModel, ModelSummary } from '../api/model';

export const useModel = () => {
  const [model, setModel] = useState<ApplicationModel | null>(null);
  const [summary, setSummary] = useState<ModelSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [modelData, summaryData] = await Promise.all([getModel(), getModelSummary()]);
      setModel(modelData);
      setSummary(summaryData);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load model data');
    } finally {
      setLoading(false);
    }
  }, []);

  const discoverProject = useCallback(async () => {
    setLoading(true);
    try {
      await apiDiscoverProject();
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to discover project');
    } finally {
      setLoading(false);
    }
  }, [loadData]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return { 
    model, 
    summary, 
    loading, 
    error, 
    reload: loadData, 
    refreshModel: loadData, 
    discoverProject 
  };
};
