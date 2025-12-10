import { Router } from 'express';
import { SubscriptionController } from '../controllers/subscription.controller';

const router = Router();

// Todas as rotas de subscription requerem autenticação
// O middleware authenticate é aplicado no server.ts

router.get('/my', SubscriptionController.getMySubscription);
router.post('/start-trial', SubscriptionController.startTrial);
router.post('/change-plan', SubscriptionController.changePlan);
router.post('/cancel', SubscriptionController.cancelSubscription);
router.post('/create-checkout', SubscriptionController.createCheckout);

export default router;
