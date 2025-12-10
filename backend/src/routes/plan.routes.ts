import { Router } from 'express';
import { PlanController } from '../controllers/plan.controller';

const router = Router();

// Rotas públicas (não requerem autenticação)
router.get('/', PlanController.listPlans);
router.get('/:slug', PlanController.getPlanBySlug);

export default router;
