const express = require('express');
const Razorpay = require('razorpay');
const cors = require('cors');
const schedule = require('node-schedule');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Zaply API credentials
const instanceId = process.env.ZAPLY_INSTANCE_ID;
const zaplyApiKey = process.env.ZAPLY_API_KEY;

/**
 * Send immediate WhatsApp message
 * @param {String} phoneNumber - Customer phone number (with country code, no +)
 * @param {String} message - Message text to send
 * @returns {Promise} - API response
 */
async function sendWhatsAppMessage(phoneNumber, message) {
  try {
    console.log(`Sending WhatsApp message to ${phoneNumber}`);
    
    const response = await axios.post(
      `https://api.zaply.dev/v1/instance/${instanceId}/message/send`,
      {
        number: phoneNumber,
        message: message,
      },
      {
        headers: {
          'Authorization': `Bearer ${zaplyApiKey}`,
          'Content-Type': 'application/json',
        }
      }
    );
    
    console.log('WhatsApp message sent successfully:', response.data);
    return { success: true, data: response.data };
  } catch (error) {
    console.error('Error sending WhatsApp message:', error.response?.data || error.message);
    return { success: false, error: error.response?.data || error.message };
  }
}

/**
 * Schedule a WhatsApp reminder for 24 hours before the event
 * @param {String} phoneNumber - Customer phone number
 * @param {Date} slotDateTime - Date and time of the booking
 * @param {Object} bookingDetails - Additional booking details for the message
 */
function scheduleWhatsAppReminder(phoneNumber, slotDateTime, bookingDetails = {}) {
  // Calculate 24 hours before slot
  const reminderTime = new Date(new Date(slotDateTime).getTime() - 24 * 60 * 60 * 1000);

  console.log(`Scheduling reminder for ${phoneNumber} at ${reminderTime}`);

  // Format a nice reminder message with booking details
  const reminderMessage = formatReminderMessage(bookingDetails);

  schedule.scheduleJob(reminderTime, async function () {
    try {
      await sendWhatsAppMessage(phoneNumber, reminderMessage);
    } catch (error) {
      console.error('Error in scheduled WhatsApp reminder:', error);
    }
  });
}

/**
 * Format reminder message with booking details
 * @param {Object} details - Booking details
 * @returns {String} - Formatted message
 */
function formatReminderMessage(details) {
  const { bookingName, slotDate, slotTime, slotType, people } = details;
  
  return `🔔 *Reminder: Your Event Tomorrow!* 🔔

Hello ${bookingName || 'there'}!

This is a friendly reminder that your ${slotType || 'event'} is scheduled for *tomorrow* at:
⏰ *${slotTime || 'your scheduled time'}*

Please remember:
- Bring your AADHAAR card for entry
- Arrive 15 minutes early to complete check-in
- Your booking is for ${people || 'your party'} people

We're looking forward to hosting you! If you need to make any changes, please contact us immediately.

Have a great day! 🎉`;
}

// Create Order API
app.post('/create-order', async (req, res) => {
  try {
    const { amount } = req.body;
    const options = {
      amount: amount * 100,
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

// Verify Payment API
app.post('/verify-payment', async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    res.json({
      status: 'success',
      message: 'Payment verified successfully'
    });
  } catch (error) {
    console.error('Error verifying payment:', error);
    res.status(500).json({ error: 'Payment verification failed' });
  }
});

// New API: Book Slot and Schedule Reminder
app.post('/book-slot', async (req, res) => {
  try {
    const { phoneNumber, slotDate, slotTime, bookingName, people, slotType } = req.body;

    if (!phoneNumber || !slotDate || !slotTime) {
      return res.status(400).json({ 
        error: 'Missing required parameters (phoneNumber, slotDate, slotTime)' 
      });
    }

    // Combine date and time to form full Date object
    const slotDateTime = new Date(`${slotDate}T${slotTime}`);

    if (isNaN(slotDateTime.getTime())) {
      return res.status(400).json({ error: 'Invalid date or time format' });
    }

    // Schedule the WhatsApp reminder
    scheduleWhatsAppReminder(phoneNumber, slotDateTime, {
      bookingName,
      slotDate,
      slotTime,
      people,
      slotType
    });

    res.json({
      success: true,
      message: 'Slot booked and reminder scheduled successfully',
      slotDateTime: slotDateTime
    });
  } catch (error) {
    console.error('Error booking slot:', error);
    res.status(500).json({ error: 'Failed to book slot' });
  }
});

// New API: Send immediate WhatsApp message
app.post('/send-whatsapp', async (req, res) => {
  try {
    const { phoneNumber, message, bookingInfo } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    // If a custom message is provided, use it
    // Otherwise, generate a message from the booking info
    const messageToSend = message || formatBookingConfirmationMessage(bookingInfo);
    
    const result = await sendWhatsAppMessage(phoneNumber, messageToSend);
    
    if (result.success) {
      // Also schedule the reminder if we have booking date/time info
      if (bookingInfo && bookingInfo.date && bookingInfo.time) {
        const startTime = bookingInfo.time.split(' - ')[0];
        const slotDateTime = new Date(`${bookingInfo.date}T${startTime}`);
        
        if (!isNaN(slotDateTime.getTime())) {
          scheduleWhatsAppReminder(phoneNumber, slotDateTime, {
            bookingName: bookingInfo.name,
            slotDate: bookingInfo.date,
            slotTime: bookingInfo.time,
            people: bookingInfo.people,
            slotType: bookingInfo.slotType
          });
        }
      }
      
      res.json({
        success: true,
        message: 'WhatsApp message sent successfully',
        data: result.data
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('Error sending WhatsApp message:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to send WhatsApp message' 
    });
  }
});

/**
 * Format confirmation message with booking details
 * @param {Object} info - Booking information
 * @returns {String} - Formatted message
 */
function formatBookingConfirmationMessage(info) {
  if (!info) return "Your booking has been confirmed. Thank you!";
  
  return `🎉 *Booking Confirmed!* 🎉

Thank you for booking with us, ${info.name || 'valued customer'}!

*Your Booking Details:*
📅 Date: ${info.date || 'As scheduled'}
⏰ Time: ${info.time || 'As scheduled'}
👥 Number of People: ${info.people || 'N/A'}
📍 Location: ${info.location || 'Our Theater'}
🎭 Event Type: ${info.slotType || 'Birthday Celebration'}
${info.hasDecorations === 'Yes' ? '🎊 Decorations: Included' : ''}
${info.extraDecorations && info.extraDecorations !== 'None' ? `✨ Extra Decorations: ${info.extraDecorations}` : ''}

We've received your advance payment and your slot is now confirmed. Please remember to bring your AADHAAR card during check-in.

We'll send you a reminder 24 hours before your event. If you have any questions, please don't hesitate to contact us.

Looking forward to making your special day memorable! 🎂`;
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});