const { addEmailJob } = require('../queues');

const sendOrderEmail = async (to, orderData) => {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #2563EB;">Buyurtmangiz qabul qilindi!</h2>
      <p>Buyurtma raqami: #${orderData.id}</p>
      <p>Jami summa: ${orderData.total_amount} UZS</p>
      <p>Status: ${orderData.status}</p>
      <p>Xaridor: ${orderData.customer_name}</p>
      <p>Telefon: ${orderData.customer_phone}</p>
      <p>Manzil: ${orderData.customer_address}</p>
      <hr>
      <p>Tashakkur bizni tanlaganingiz uchun!</p>
    </div>
  `;
  
  await addEmailJob({
    to,
    subject: `Buyurtma #${orderData.id} qabul qilindi`,
    html,
    text: `Buyurtma #${orderData.id} qabul qilindi. Jami: ${orderData.total_amount} UZS`
  });
};

const sendRefundEmail = async (to, refundData) => {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #2563EB;">Refund so'rovi</h2>
      <p>Refund ID: #${refundData.id}</p>
      <p>Buyurtma ID: #${refundData.order_id}</p>
      <p>Miqdor: ${refundData.amount} UZS</p>
      <p>Sabab: ${refundData.reason}</p>
      <p>Status: ${refundData.status}</p>
      <hr>
      <p>Refund so'rovingiz ko'rib chiqiladi.</p>
    </div>
  `;
  
  await addEmailJob({
    to,
    subject: `Refund so'rovi #${refundData.id}`,
    html,
    text: `Refund so'rovi #${refundData.id} qabul qilindi. Miqdor: ${refundData.amount} UZS`
  });
};

const sendSupportReply = async (to, ticketData, message) => {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #2563EB;">Support ticketga javob</h2>
      <p>Ticket ID: #${ticketData.id}</p>
      <p>Mavzu: ${ticketData.subject}</p>
      <hr>
      <p><strong>Javob:</strong></p>
      <p>${message}</p>
      <hr>
      <p>Savollaringiz bo'lsa, javob berishdan xursandmiz.</p>
    </div>
  `;
  
  await addEmailJob({
    to,
    subject: `Support ticket #${ticketData.id} ga javob`,
    html,
    text: `Support ticket #${ticketData.id} ga javob yuborildi`
  });
};

const sendPasswordReset = async (to, code) => {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #2563EB;">Parolni tiklash</h2>
      <p>Tasdiqlash kodi: <strong style="font-size: 24px; color: #2563EB;">${code}</strong></p>
      <p>Bu kod 10 daqiqa ichida amal qiladi.</p>
      <hr>
      <p>Kodni hech kimga bermang!</p>
    </div>
  `;
  
  await addEmailJob({
    to,
    subject: 'Parolni tiklash kodi',
    html,
    text: `Parolni tiklash kodi: ${code}`
  });
};

module.exports = {
  sendOrderEmail,
  sendRefundEmail,
  sendSupportReply,
  sendPasswordReset
};
