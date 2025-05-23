// server.js — Stripe Webhooks + Purchase Endpoint + Firebase Admin Wallet Update
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const bodyParser = require('body-parser');
const admin = require('firebase-admin');

const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const firestore = admin.firestore();

const app = express();
app.use(cors());
app.use(express.json());

// 🔁 Health Check
app.get('/api/ping', (req, res) => {
  res.send('pong');
});

// 💸 Coin purchase - creates payment intent
app.post('/api/purchase-coins', async (req, res) => {
  const { amount, userId } = req.body;

  if (!amount || !userId) {
    return res.status(400).json({ error: 'Amount and userId are required.' });
  }

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount * 100,
      currency: 'usd',
      metadata: { userId, amount },
    });

    console.log(`✅ [Stripe] Intent created: $${amount} for ${userId}`);
    res.send({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    console.error('❌ Stripe error:', err.message);
    res.status(500).send({ error: err.message });
  }
});

// 🧠 Stripe Webhook Endpoint
app.post('/webhook', bodyParser.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('❌ Webhook signature error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // ✅ Handle successful payment
  if (event.type === 'payment_intent.succeeded') {
    const paymentIntent = event.data.object;
    const userId = paymentIntent.metadata.userId;
    const amount = Number(paymentIntent.metadata.amount);

    console.log(`💰 Payment succeeded for ${userId} — $${amount}`);

    // ✅ Update Firebase Firestore wallet balance
    firestore.collection('wallets').doc(userId).set({
      balance: admin.firestore.FieldValue.increment(amount),
      lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true }).then(() => {
      console.log(`🟢 Wallet updated for ${userId}`);
    }).catch((err) => {
      console.error(`❌ Firestore update failed for ${userId}:`, err.message);
    });
  }

  res.json({ received: true });
});

// 🟢 Start Server
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`🔥 Backend running on http://localhost:${PORT}`);
});
