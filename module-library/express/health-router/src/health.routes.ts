import { Router } from 'express';

/** A dependency-free health probe that can be mounted at any API prefix. */
export const healthRouter = Router();

healthRouter.get('/', (_request, response) => {
  response.status(200).json({ status: 'ok' });
});
