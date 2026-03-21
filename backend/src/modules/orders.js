// Orders module: handles premium and trading order endpoints

let storage; let
  z;
let premiumOrderBodySchema;
function injectDeps(deps) {
  storage = deps.storage;
  z = deps.z;
  premiumOrderBodySchema = z.object({
    transferReference: z.string().min(1).max(200),
    notes: z.string().max(500).optional(),
    orderType: z.enum(['creator', 'trading']).optional().default('creator'),
    subscriptionPeriod: z
      .enum(['once', 'monthly', 'yearly'])
      .optional()
      .default('once'),
  });
}

function getTradingAmount(period) {
  return period === 'yearly' ? '100.00' : '10.00';
}

async function getPremiumStatus(req, res) {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    const isPremium = await storage.getUserPremiumStatus(userId);
    const tradingAccess = await storage.getUserTradingAccess(userId);
    const orders = await storage.getPremiumOrders(userId);
    res.json({
      isPremium,
      hasTrading: tradingAccess.hasAccess,
      tradingExpiresAt: tradingAccess.expiresAt,
      orders,
    });
  } catch {
    res.status(500).json({ message: 'Failed to fetch premium status' });
  }
}

async function getTradingAccess(req, res) {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    const tradingAccess = await storage.getUserTradingAccess(userId);
    const pendingOrders = (await storage.getPremiumOrders(userId)).filter(
      (o) => o.orderType === 'trading' && o.status === 'pending',
    );
    res.json({
      hasAccess: tradingAccess.hasAccess,
      expiresAt: tradingAccess.expiresAt,
      hasPending: pendingOrders.length > 0,
    });
  } catch {
    res.status(500).json({ message: 'Failed to check trading access' });
  }
}

async function createPremiumOrder(req, res) {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    const parsed = premiumOrderBodySchema.safeParse(req.body);
    if (!parsed.success) return res
      .status(400)
      .json({ message: 'Invalid input', errors: parsed.error.flatten() });
    const period =
      parsed.data.orderType === 'trading'
        ? parsed.data.subscriptionPeriod || 'monthly'
        : 'once';
    const amount =
      parsed.data.orderType === 'trading' ? getTradingAmount(period) : '9.00';
    const order = await storage.createPremiumOrder({
      userId,
      amount,
      currency: 'EUR',
      transferReference: parsed.data.transferReference,
      notes: parsed.data.notes || null,
      orderType: parsed.data.orderType,
      subscriptionPeriod: period,
    });
    res.json(order);
  } catch {
    res.status(500).json({ message: 'Failed to create order' });
  }
}

module.exports = {
  injectDeps,
  getPremiumStatus,
  getTradingAccess,
  createPremiumOrder,
};
