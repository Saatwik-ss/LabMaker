import React, { useState } from 'react';
import { useSettings } from '../hooks/useSettings';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Spinner } from '../components/ui/Spinner';
import { useModel } from '../hooks/useModel';
import { runValidation, ValidationResult } from '../api/validation';

export const SettingsPage = () => {
  const { settings, updateSettings } = useSettings();
  const { summary } = useModel();
  const [formData, setFormData] = useState(settings);
  const [saved, setSaved] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateSettings(formData);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleValidate = async () => {
    setValidating(true);
    try {
      const res = await runValidation();
      setValidationResult(res);
    } catch (err) {
      console.error(err);
    } finally {
      setValidating(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto animate-fade-in overflow-y-auto h-full space-y-6">
      <h1 className="text-2xl font-bold mb-6">Settings & Configuration</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold mb-4 border-b border-gray-800 pb-2">API Configuration</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">OpenAI API Key</label>
                  <input type="password" value={formData.openaiApiKey} onChange={e => setFormData({ ...formData, openaiApiKey: e.target.value })} className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white focus:border-blue-500 focus:outline-none" placeholder="sk-..." />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Anthropic API Key</label>
                  <input type="password" value={formData.anthropicApiKey} onChange={e => setFormData({ ...formData, anthropicApiKey: e.target.value })} className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white focus:border-blue-500 focus:outline-none" placeholder="sk-ant-..." />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Groq API Key</label>
                  <input type="password" value={formData.groqApiKey || ''} onChange={e => setFormData({ ...formData, groqApiKey: e.target.value })} className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white focus:border-blue-500 focus:outline-none" placeholder="gsk_..." />
                  <span className="text-[11px] text-gray-500 mt-1 block">Used for ultra-fast Llama 3 / Mixtral inference, services, and modules.</span>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Custom API URL (Optional)</label>
                  <input type="text" value={formData.customApiUrl} onChange={e => setFormData({ ...formData, customApiUrl: e.target.value })} className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white focus:border-blue-500 focus:outline-none" placeholder="http://localhost:3001" />
                </div>
              </div>
            </div>

            <div>
              <h2 className="text-lg font-semibold mb-4 border-b border-gray-800 pb-2">Agent Configuration</h2>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Custom System Prompt</label>
                <textarea value={formData.systemPrompt} onChange={e => setFormData({ ...formData, systemPrompt: e.target.value })} className="w-full h-32 bg-gray-800 border border-gray-700 rounded p-2 text-white focus:border-blue-500 focus:outline-none resize-none font-mono text-sm" placeholder="You are an expert full-stack developer..." />
              </div>
            </div>

            <div className="flex items-center gap-4 pt-2">
              <Button type="submit">Save Settings</Button>
              {saved && <span className="text-green-400 text-sm">Settings saved!</span>}
            </div>
          </form>
        </Card>

        <div className="space-y-6">
          <Card>
            <h2 className="text-lg font-semibold mb-4 border-b border-gray-800 pb-2">Project Info</h2>
            {summary ? (
              <div className="space-y-2 text-sm text-gray-300">
                <div className="flex justify-between"><span className="text-gray-500">Name</span><span className="font-semibold text-white">{summary.name}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Version</span><span>{summary.version}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Frontend</span><span className="capitalize">{summary.frontend}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Last Updated</span><span>{new Date(summary.updatedAt).toLocaleString()}</span></div>
              </div>
            ) : (
              <p className="text-sm text-gray-500">No project info available.</p>
            )}
          </Card>

          <Card>
            <div className="flex justify-between items-center mb-4 border-b border-gray-800 pb-2">
              <h2 className="text-lg font-semibold">Project Validation</h2>
              <Button onClick={handleValidate} disabled={validating} variant="secondary" className="text-xs py-1 px-3">
                {validating ? <Spinner size="sm" /> : 'Run Checks'}
              </Button>
            </div>

            {validationResult ? (
              <div className="space-y-4 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-gray-400">Status:</span>
                  <Badge variant={validationResult.passed ? 'success' : 'error'}>
                    {validationResult.passed ? 'PASSED' : 'FAILED'}
                  </Badge>
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between items-center bg-gray-900 p-2 rounded">
                    <span>Linting</span>
                    <Badge variant={validationResult.linting.passed ? 'success' : 'error'}>
                      {validationResult.linting.totalIssues} Issues
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center bg-gray-900 p-2 rounded">
                    <span>Type Check</span>
                    <Badge variant={validationResult.typeCheck.passed ? 'success' : 'error'}>
                      {validationResult.typeCheck.totalErrors} Errors
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center bg-gray-900 p-2 rounded">
                    <span>Unit Tests</span>
                    <Badge variant={validationResult.unitTests.passed ? 'success' : 'error'}>
                      {validationResult.unitTests.passedTests} / {validationResult.unitTests.totalTests} Passed
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center bg-gray-900 p-2 rounded">
                    <span>Build Check</span>
                    <Badge variant={validationResult.buildCheck.passed ? 'success' : 'error'}>
                      {validationResult.buildCheck.passed ? 'Success' : 'Failed'}
                    </Badge>
                  </div>
                </div>

                {!validationResult.passed && validationResult.summary.suggestions?.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-gray-800">
                    <h4 className="text-gray-400 mb-2">Suggestions:</h4>
                    <ul className="list-disc pl-4 space-y-1 text-gray-300">
                      {validationResult.summary.suggestions.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-500">Run validation to check project health.</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};
