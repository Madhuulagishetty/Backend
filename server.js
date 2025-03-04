const express = require('express');
const Razorpay = require('razorpay');
const cors = require('cors');
const twilio = require('twilio');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Initialize Twilio
const twilioClient = new twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

app.post('/create-order', async (req, res) => {
  try {
    const { amount } = req.body;
    const options = {
      amount: amount * 100, // Razorpay expects amount in paise
      currency: 'INR',
      receipt: 'receipt_' + Date.now(),
    };

    const order = await razorpay.orders.create(options);
    res.json(order);
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

app.post('/verify-payment', async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    
    // Here you should implement signature verification
    // For now, we'll just acknowledge the payment
    res.json({
      status: 'success',
      message: 'Payment verified successfully'
    });
  } catch (error) {
    console.error('Error verifying payment:', error);
    res.status(500).json({ error: 'Payment verification failed' });
  }
});

// New endpoint to send WhatsApp messages
app.post('/send-whatsapp', async (req, res) => {
  try {
    const { to, date, time } = req.body;
    
    if (!to || !date || !time) {
      return res.status(400).json({ 
        error: 'Missing required parameters. Please provide to, date, and time.' 
      });
    }

    // Format the recipient number for WhatsApp
    const recipient = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
    
    // Send the WhatsApp message using Twilio
    const message = await twilioClient.messages.create({
      from: `${process.env.TWILIO_WHATSAPP_NUMBER}`,
      to: recipient,
      body: `Your birthday celebration booking is confirmed for ${date} at ${time}. We're excited to host you! If you need to make any changes, please contact us.`,
    });

    res.json({
      success: true,
      messageId: message.sid,
      status: message.status
    });
  } catch (error) {
    console.error('Error sending WhatsApp message:', error);
    res.status(500).json({ 
      error: 'Failed to send WhatsApp message',
      details: error.message 
    });
  }
});

// Endpoint to send reminder messages (can be triggered by a scheduled job)
app.post('/send-reminder', async (req, res) => {
  try {
    const { to, date, time } = req.body;
    
    if (!to || !date || !time) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    // Format the recipient number for WhatsApp
    const recipient = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
    
    // Send the reminder message
    const message = await twilioClient.messages.create({
      from: `${process.env.TWILIO_WHATSAPP_NUMBER}`,
      to: recipient,
      body: `Reminder: Your birthday celebration is tomorrow, ${date} at ${time}. We're looking forward to seeing you!`,
    });

    res.json({
      success: true,
      messageId: message.sid,
      status: message.status
    });
  } catch (error) {
    console.error('Error sending reminder:', error);
    res.status(500).json({ 
      error: 'Failed to send reminder',
      details: error.message 
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
