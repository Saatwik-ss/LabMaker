import { Router, Request, Response, NextFunction } from 'express';
import { Validator } from '../../validation/Validator';

export function createValidationHandler(validator: Validator): Router {
  const router = Router();

  const handleValidate = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validationResult = await validator.validate();
      res.json(validationResult);
    } catch (error) {
      next(error);
    }
  };

  router.get('/', handleValidate);
  router.post('/', handleValidate);

  return router;
}
