import { Router, Request, Response, NextFunction } from 'express';
import { AgentOrchestrator } from '../../agent/AgentOrchestrator';
import { AgentRequest } from '@codex/shared';
import { IAIHarness } from '@codex/ai-harness';

export function createAgentHandler(
  orchestrator: AgentOrchestrator,
  harness?: IAIHarness
): Router {
  const router = Router();

  router.post('/request', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const agentRequest: AgentRequest = req.body;
      if (harness) {
        const result = await harness.executeTask(agentRequest);
        return res.json(result);
      }
      const result = await orchestrator.processRequest(agentRequest);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.get('/status/:requestId', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { requestId } = req.params;
      const status = await orchestrator.getRequestStatus(requestId);
      if (!status) {
        return res.status(404).json({ error: 'Request not found' });
      }
      res.json(status);
    } catch (error) {
      next(error);
    }
  });

  router.post('/approve/:requestId', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { requestId } = req.params;
      const result = await orchestrator.approveAndExecute(requestId);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.post('/cancel/:requestId', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { requestId } = req.params;
      await orchestrator.cancelRequest(requestId);
      res.json({ success: true, message: 'Request cancelled successfully' });
    } catch (error) {
      next(error);
    }
  });

  router.get('/plan/:requestId', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { requestId } = req.params;
      const plan = await orchestrator.getPlanForReview(requestId);
      if (!plan) {
        return res.status(404).json({ error: 'Plan not found or not ready' });
      }
      res.json(plan);
    } catch (error) {
      next(error);
    }
  });

  router.get('/capabilities', async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (harness) {
        return res.json({ capabilities: harness.listCapabilities() });
      }
      res.json({ capabilities: [] });
    } catch (error) {
      next(error);
    }
  });

  router.post('/capabilities/:id/execute', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const input = req.body;
      if (!harness) {
        return res.status(500).json({ error: 'AI Harness not attached' });
      }
      const output = await harness.executeCapability(id, input);
      res.json({ success: true, capabilityId: id, output });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
