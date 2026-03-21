// Admin Orders module: handles admin order management endpoints

let storage;
function injectDeps(deps) {
  storage = deps.storage;
}

async function getOrders(req, res) {
  try {
    const orders = await storage.getPremiumOrders();
    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch orders' });
  }
}

async function confirmOrder(req, res) {
  try {
    const orderId = Number(req.params.id);
    if (isNaN(orderId)) return res.status(400).json({ message: 'Invalid order ID' });
    const order = await storage.confirmPremiumOrder(orderId);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ message: 'Failed to confirm order' });
  }
}

async function rejectOrder(req, res) {
  try {
    const orderId = Number(req.params.id);
    if (isNaN(orderId)) return res.status(400).json({ message: 'Invalid order ID' });
    const order = await storage.rejectPremiumOrder(orderId);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ message: 'Failed to reject order' });
  }
}

module.exports = {
  injectDeps,
  getOrders,
  confirmOrder,
  rejectOrder,
};
