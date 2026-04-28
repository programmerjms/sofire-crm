# Sofire-IT Support — Invoice CRM

A full-featured invoice management CRM built for Juan Du Plessis / Sofire-IT Support. Runs entirely in the browser with no backend required — all data stored in `localStorage`.

## ✨ Features

- **Invoice Builder** — Create professional invoices with live preview (same layout as your Bookipi template)
- **Customer Management** — Add, edit, and manage your client base with invoice history per customer
- **Payment Tracking** — Record payments with method, reference number, and notes
- **Proof of Payment Uploads** — Attach PNG, JPG, or PDF proof of payments (stored in-browser)
- **Dashboard** — Financial overview with total earned, outstanding, overdue amounts
- **Export** — Download all your data as a JSON backup
- **Print / PDF** — Print any invoice directly from the preview panel

## 🚀 Hosting on GitHub Pages

1. Create a new GitHub repository (e.g. `sofire-crm`)
2. Upload `index.html` to the root of the repository
3. Go to **Settings → Pages**
4. Under **Source**, select `main` branch and `/ (root)`
5. Click **Save**
6. Your CRM will be live at: `https://yourusername.github.io/sofire-crm`

## 💾 Data Storage

All data (invoices, customers, payments, proof of payment files) is saved in your browser's `localStorage`. 

> **Important:** Data is tied to the browser and device. Use the **Export** button regularly to back up your data as a JSON file.

To restore from backup: open browser console and run:
```js
localStorage.setItem('sofire_crm', '<paste JSON here>');
location.reload();
```

## 🏦 Bank Details (Pre-configured)

- **Bank:** FNB/RMB  
- **Account Holder:** Sofireit Support  
- **Account Type:** First Business Zero Account  
- **Account Number:** 63095872032  
- **Branch Code:** 250655  

## 📞 Contact

Juan Du Plessis — juan@sofire-it.co.za — +27 671 371 638
