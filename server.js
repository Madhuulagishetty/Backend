const { initializeApp } = require('firebase/app');
const { getFirestore, collection, addDoc } = require('firebase/firestore');
const axios = require('axios');

const firebaseConfig = {
  apiKey: "AIzaSyBh48b4J2mL4d9cGy8TBFE_3qiZL5NMnMY",
  authDomain: "birthday-fad86.firebaseapp.com",
  projectId: "birthday-fad86",
  storageBucket: "birthday-fad86.firebasestorage.app",
  messagingSenderId: "263994407282",
  appId: "1:263994407282:web:255bb7cf12025dfb3d05eb",
  measurementId: "G-1MCR5CKGJ3"
};
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);


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

const saveBookingToSheet = async (bookingData) => {
  try {
    const now = new Date();
    const currentDate = now.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });

    const currentTime = now.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });

    const isoTimestamp = now.toISOString();

    const response = await axios.post('https://sheetdb.io/api/v1/s6a0t5omac7jg', {
      data: [
        {
          booking_date: bookingData.date,
          booking_time: bookingData.lastItem ? `${bookingData.lastItem.start} - ${bookingData.lastItem.end}` : "Not Available",
          whatsapp_number: bookingData.whatsapp,
          num_people: bookingData.people,
          decoration: bookingData.wantDecoration ? "Yes" : "No",
          advance_amount: bookingData.advanceAmount,
          remaining_amount: bookingData.remainingAmount,
          total_amount: bookingData.amountWithTax,
          payment_id: bookingData.paymentId,
          extraDecorations: bookingData.extraDecorations,
          address: bookingData.address,
          bookingName: bookingData.bookingName,
          slotType: bookingData.slotType,
          email: bookingData.email,
          payment_status: "Partial (Advance paid)",
          NameUser: bookingData.NameUser,
          PaymentMode: "Online",
          occasion: bookingData.occasion,
          processed_date: currentDate,
          processed_time: currentTime,
          processed_timestamp: isoTimestamp,
        }
      ]
    }, {
      headers: {
        'Content-Type': 'application/json',
      }
    });

    return response.data;
  } catch (error) {
    console.error('Error saving to sheet:', error);
    throw error;
  }
};


const sendWhatsAppReminder = async (params) => {
  try {
    const { to, date, time, bookingName, people, location, slotType, decorations, extraDecorations } = params;

    const formattedNumber = to.startsWith('+') ? to.slice(1) : to;
    
    const message = 
`🎬 BOOKING CONFIRMATION 🎬

Hello ${bookingName || 'there'}!

Your theater booking is confirmed!

📅 Date: ${date}
⏰ Time: ${time}
👥 Guests: ${people || '(not specified)'}
🏠 Venue: Mini Theater ${location || ''}
🎫 Slot Type: ${slotType || 'Standard'}
${decorations ? `✨ *Decorations:* Yes${extraDecorations ? `\n   Details: ${extraDecorations}` : ''}` : ''}

Please remember:
• Arrive 15 minutes early
• Bring your AADHAAR card for verification
• No smoking/drinking allowed inside
• Maintain cleanliness in the theater

For any questions, contact us at:
📞 +91-9764535650

Thank you for your booking! Enjoy your experience!`;

    const instanceId = 'mcrtdre2eh';
    const authToken = 'ajhunrv7ff0j7giapl9xuz9olt6uax';

    const response = await axios.post(`https://api.zaply.dev/v1/instance/${instanceId}/message/send`, {
      number: formattedNumber,
      message,
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      }
    });

    console.log('WhatsApp reminder sent successfully!');
  } catch (error) {
    console.error('Error sending WhatsApp reminder:', error);
    throw error;
  }
};


const saveToFirebase = async (bookingData, paymentDetails) => {
  // Create a robust booking data structure for Firebase
  const saveData = {
    // Basic booking information
    bookingName: bookingData.bookingName,
    NameUser: bookingData.NameUser,
    email: bookingData.email,
    address: bookingData.address,
    whatsapp: bookingData.whatsapp,
    date: bookingData.date,
    people: bookingData.people,
    
    // Booking preferences
    wantDecoration: bookingData.wantDecoration,
    occasion: bookingData.occasion,
    extraDecorations: bookingData.extraDecorations || [],
    
    // Slot information
    selectedTimeSlot: bookingData.lastItem || bookingData.cartData?.[0] || null,
    lastItem: bookingData.lastItem || bookingData.cartData?.[0] || null,
    cartData: bookingData.cartData || [],
    slotType: bookingData.slotType,
    
    // Payment information
    status: "booked",
    paymentId: paymentDetails.razorpay_payment_id,
    orderId: paymentDetails.razorpay_order_id,
    paymentStatus: 'partial',
    advancePaid: bookingData.advanceAmount,
    remainingAmount: bookingData.remainingAmount,
    totalAmount: bookingData.amountWithTax,
    
    // Timestamps
    timestamp: new Date(),
    createdAt: new Date(),
    
    // Metadata
    bookingMeta: {
      createdAt: new Date(),
      source: 'web',
      version: '1.0',
      paymentMethod: 'razorpay'
    }
  };

  try {
    const collectionName = bookingData.slotType; // 'deluxe' or 'rolexe'
    const docRef = await addDoc(collection(db, collectionName), saveData);
    console.log('Booking saved successfully with ID:', docRef.id);
    
    return { ...saveData, id: docRef.id };
  } catch (error) {
    console.error('Error saving to Firebase:', error);
    throw error;
  }
};


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
    const { 
      razorpay_order_id, 
      razorpay_payment_id, 
      razorpay_signature,
      bookingData,
      advanceAmount,
      remainingAmount,
      amountWithTax
    } = req.body;
    
    // Here you should implement signature verification
    // For now, we'll just acknowledge the payment
    
    // Prepare booking data with payment info
    const bookingDataWithPayment = {
      ...bookingData,
      paymentId: razorpay_payment_id,
      advanceAmount,
      remainingAmount,
      amountWithTax
    };
    
    // Save booking to Firebase
    const savedBooking = await saveToFirebase(bookingDataWithPayment, {
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature
    });
    
    // Save to Google Sheets
    await saveBookingToSheet(bookingDataWithPayment);
    
    // Send WhatsApp confirmation
    // if (bookingData?.lastItem) {
    //   await sendWhatsAppReminder({
    //     to: `91${bookingData.whatsapp}`,
    //     date: bookingData.date,
    //     time: `${bookingData.lastItem.start} - ${bookingData.lastItem.end}`,
    //     bookingName: bookingData.bookingName || bookingData.NameUser,
    //     people: bookingData.people,
    //     location: bookingData.location || '',
    //     slotType: bookingData.slotType,
    //     decorations: bookingData.wantDecoration,
    //     extraDecorations: bookingData.extraDecorations
    //   });
    // }
    
    res.json({
      status: 'success',
      message: 'Payment verified successfully',
      savedBooking
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
