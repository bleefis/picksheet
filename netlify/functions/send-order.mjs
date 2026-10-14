// Called by the phone after it saves an order to Firebase /orders/{id}.
// Emails the order (tables + CSV attachments) and starts the cart robot.
import { sendMail } from '../lib/mail.mjs';
import { readOrder, startWorkflow, orderEmailHtml, orderDate, fileDate, csvFor, json, ORDER_EMAIL } from '../lib/order.mjs';

export default async req => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const { id } = await req.json().catch(() => ({}));
  const order = await readOrder(id);
  if (!order || !order.createdAt) return json({ error: 'Order not found' }, 400);
  // Only a fresh order that hasn't been emailed yet, so this can't be replayed.
  if (order.email || Date.now() - new Date(order.createdAt) > 15 * 60e3) return json({ error: 'Order already sent' }, 409);

  const result = {};
  try {
    await sendMail({
      to: ORDER_EMAIL,
      subject: `Four Seasons order · ${orderDate(order)}`,
      html: orderEmailHtml(order),
      attachments: [
        { name: `order-produce-${fileDate(order)}.csv`, content: csvFor(order.produce) },
        { name: `order-meat-${fileDate(order)}.csv`, content: csvFor(order.meat) }
      ]
    });
    result.email = 'sent';
  } catch (e) {
    result.email = 'failed';
    result.emailError = e.message;
  }
  try {
    if ((order.produce || []).length || (order.meat || []).length) await startWorkflow('cart-robot.yml', { order_id: id });
    result.robot = 'started';
  } catch (e) {
    result.robot = 'failed';
    result.robotError = e.message;
  }
  return json(result);
};
