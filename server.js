// server.js — Stripe + Coin Payment Logic + Webhook + Logging + Health Check
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const bodyParser = require('body-parser');

const app = express();

// Webhook raw parser (must be before express.json())
app.use('/webhook', bodyParser.raw({ type: 'application/json' }));

// General middleware
app.use(cors());
app.use(express.json());

// 🔁 Health check
app.get('/api/ping', (req, res) => {
  res.send('pong');
});

// 💸 Coin purchase route
app.post('/api/purchase-coins', async (req, res) => {
  const { amount, userId } = req.body;

  if (!amount || !userId) {
    return res.status(400).json({ error: 'Amount and userId are required.' });
  }

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount * 100, // cents
      currency: 'usd',
      metadata: { userId },
    });

    console.log(`✅ [Stripe] Intent created: $${amount} for ${userId}`);
    res.send({ clientSecret: paymentIntent.client_secret });

  } catch (err) {
    console.error('❌ Stripe error:', err.message);
    res.status(500).send({ error: err.message });
  }
});

// 🧠 Stripe Webhook: confirm + credit coins
app.post('/webhook', (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('❌ Webhook Error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'payment_intent.succeeded') {
    const paymentIntent = event.data.object;
    const userId = paymentIntent.metadata.userId;
    const amount = paymentIntent.amount / 100;

    console.log(`✅ [Webhook] Payment success: ${userId} bought $${amount}`);

    // 🧾 TODO: Update Firestore wallet balance here
    // await firestore.collection('wallets').doc(userId).update({
    //   coins: increment(amount)
    // });
  }

  res.json({ received: true });
});

// 🟢 Start server
const PORT = process.env.PORT || 5001;
app.listen(PORT, () =>
  console.log(`🔥 Backend running on http://localhost:${PORT}`)
);
