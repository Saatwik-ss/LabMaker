import { useState } from 'react';
import { requestAgent, AgentRequest, AgentResult } from '../api/agent';

export const useAgent = () => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AgentResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sendRequest = async (request: AgentRequest) => {
    setLoading(true);
    setError(null);
    try {
      const res = await requestAgent(request);
      setResult(res);
      return res;
    } catch (err: any) {
      setError(err.message || 'An error occurred');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { loading, result, error, sendRequest };
};
