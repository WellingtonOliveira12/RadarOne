import { Router } from 'express';
import { CouponController } from '../controllers/coupon.controller';
import { authenticateToken } from '../middlewares/auth.middleware';

const router = Router();

// Validar cupom (público - não precisa autenticação)
router.post('/validate', CouponController.validateCoupon);

// Aplicar cupom (requer autenticação)
router.post('/apply', authenticateToken, CouponController.applyCoupon);

// Resgatar cupom de trial upgrade (requer autenticação)
// FASE: CUPONS DE UPGRADE - libera plano premium temporário
router.post('/redeem-trial-upgrade', authenticateToken, CouponController.redeemTrialUpgrade);

export default router;
