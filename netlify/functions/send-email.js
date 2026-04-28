/**
 * Netlify Function: send-email.js
 * Sends emails via mail.sofire-it.co.za SMTP (SSL port 465)
 *
 * Set these in Netlify Dashboard → Site → Environment Variables:
 *   SMTP_HOST   = mail.sofire-it.co.za
 *   SMTP_PORT   = 465
 *   SMTP_USER   = finance@sofire-it.co.za
 *   SMTP_PASS   = (your email password - set in Netlify, never in this file)
 *   SMTP_FROM   = Juan Du Plessis <finance@sofire-it.co.za>
 */

const nodemailer = require('nodemailer');

exports.handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { to, toName, subject, message, htmlBody, attachments } = body;

  if (!to || !subject) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing required fields: to, subject' }),
    };
  }

  const SMTP_HOST = process.env.SMTP_HOST || 'mail.sofire-it.co.za';
  const SMTP_PORT = parseInt(process.env.SMTP_PORT || '465');
  const SMTP_USER = process.env.SMTP_USER || 'finance@sofire-it.co.za';
  const SMTP_PASS = process.env.SMTP_PASS;
  const SMTP_FROM = process.env.SMTP_FROM || '"Sofire-IT Support" <finance@sofire-it.co.za>';

  if (!SMTP_PASS) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        error: 'SMTP_PASS not set. Add it in Netlify Dashboard → Site → Environment Variables.',
      }),
    };
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465, // SSL for 465, STARTTLS for 587
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    tls: { rejectUnauthorized: false }, // needed for shared hosting certs
  });

  const mailAttachments = (attachments || []).map(att => ({
    filename: att.filename,
    content: Buffer.from(att.data, 'base64'),
    contentType: att.contentType || 'application/octet-stream',
  }));

  const finalHtml = htmlBody || `
    <div style="font-family:Helvetica Neue,Arial,sans-serif;max-width:600px;margin:0 auto">
      <div style="background:#0a0a0f;padding:20px 28px;border-radius:8px 8px 0 0">
        <div style="color:#fff;font-size:18px;font-weight:800">Sofire-IT Support</div>
        <div style="color:#ff3c3c;font-size:10px;letter-spacing:1px;text-transform:uppercase;margin-top:3px">Finance Department</div>
      </div>
      <div style="background:#fff;padding:28px;border:1px solid #e8e8e8;border-top:none">
        <p style="font-size:14px;color:#444;line-height:1.7">${(message || '').replace(/\n/g, '<br>')}</p>
      </div>
      <div style="background:#f8f8f8;padding:14px 28px;border:1px solid #e8e8e8;border-top:none;border-radius:0 0 8px 8px;font-size:11px;color:#999;text-align:center">
        Sofire-IT Support &middot; finance@sofire-it.co.za &middot; +27 671 371 638
      </div>
    </div>`;

  try {
    await transporter.verify();

    const info = await transporter.sendMail({
      from: SMTP_FROM,
      to: toName ? `"${toName}" <${to}>` : to,
      replyTo: SMTP_FROM,
      subject,
      text: message || '',
      html: finalHtml,
      attachments: mailAttachments,
    });

    console.log('Sent:', info.messageId);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ success: true, messageId: info.messageId }),
    };
  } catch (err) {
    console.error('SMTP error:', err.message);
    let msg = err.message;
    if (msg.includes('Invalid login') || msg.includes('auth')) msg = 'Authentication failed — check SMTP_USER and SMTP_PASS in Netlify Environment Variables.';
    else if (msg.includes('ECONNREFUSED') || msg.includes('connect')) msg = 'Cannot connect to mail.sofire-it.co.za:465 — check your Netlify environment variables.';
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: msg }),
    };
  }
};
