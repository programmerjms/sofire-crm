/**
 * Netlify Function: db.js
 * Secure database API — uses SUPABASE_SERVICE_ROLE_KEY (never exposed to browser)
 * All CRM data operations route through here.
 *
 * Env vars (auto-set by Netlify×Supabase integration):
 *   SUPABASE_URL              = https://gpslxejjpgchmrzriskv.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY = (set by integration)
 *   SUPABASE_ANON_KEY         = (set by integration)
 *
 * Actions:
 *   auth.login      — verify credentials, return session token
 *   auth.verify     — verify a session token
 *   sync.push       — save entire tenant state to DB
 *   sync.pull       — load entire tenant state from DB
 *   sync.migrate    — bulk import from localStorage JSON
 *   tenants.list    — list all tenants (superadmin only)
 *   tenants.upsert  — create or update a tenant
 *   tenants.delete  — delete a tenant and all their data
 */

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://gpslxejjpgchmrzriskv.supabase.co';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getClient() {
  if (!SERVICE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY not set in Netlify environment variables.');
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

function sha256(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

function cors(body, status = 200) {
  return {
    statusCode: status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, X-Tenant-Id, X-Session-Token',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    },
    body: JSON.stringify(body),
  };
}

function err(msg, status = 400) {
  return cors({ error: msg }, status);
}

// ── Simple signed session token (HMAC-SHA256)
function makeSessionToken(tenantId, username, role) {
  const payload = JSON.stringify({ tenantId, username, role, ts: Date.now() });
  const b64 = Buffer.from(payload).toString('base64url');
  const sig  = crypto.createHmac('sha256', SERVICE_KEY).update(b64).digest('base64url');
  return `${b64}.${sig}`;
}

function verifySessionToken(token) {
  try {
    const [b64, sig] = token.split('.');
    const expected   = crypto.createHmac('sha256', SERVICE_KEY).update(b64).digest('base64url');
    if (sig !== expected) return null;
    const payload = JSON.parse(Buffer.from(b64, 'base64url').toString());
    // Expire after 30 days
    if (Date.now() - payload.ts > 30 * 24 * 3600 * 1000) return null;
    return payload;
  } catch { return null; }
}

// ── Convert flat DB rows to the nested state format the frontend expects
function rowsToState(rows) {
  return rows;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({}, 200);
  if (event.httpMethod !== 'POST') return err('Method not allowed', 405);

  let body;
  try { body = JSON.parse(event.body); }
  catch { return err('Invalid JSON'); }

  const { action, payload } = body;
  if (!action) return err('Missing action');

  let db;
  try { db = getClient(); }
  catch (e) { return err(e.message, 500); }

  // ============================================================
  // AUTH.LOGIN — verify username + password, return session token
  // ============================================================
  if (action === 'auth.login') {
    const { username, passwordHash } = payload || {};
    if (!username || !passwordHash) return err('Missing username or passwordHash');

    const { data: tenant, error } = await db
      .from('tenants')
      .select('*')
      .eq('username', username.toLowerCase().trim())
      .eq('password_hash', passwordHash)
      .maybeSingle();

    if (error) return err('Database error: ' + error.message, 500);
    if (!tenant) return cors({ success: false, error: 'Invalid credentials' });
    if (tenant.status === 'suspended') return cors({ success: false, error: 'Portal suspended. Contact Sofire-IT Support.' });

    // Fetch this tenant's settings too
    const { data: settings } = await db
      .from('settings')
      .select('*')
      .eq('tenant_id', tenant.id)
      .maybeSingle();

    const token = makeSessionToken(tenant.id, tenant.username, tenant.role);
    return cors({
      success: true,
      token,
      tenant: {
        id:         tenant.id,
        username:   tenant.username,
        company:    tenant.company || settings?.company || '',
        email:      tenant.email,
        role:       tenant.role,
        status:     tenant.status,
      },
      settings: settings || null,
    });
  }

  // ============================================================
  // AUTH.VERIFY — check if a session token is still valid
  // ============================================================
  if (action === 'auth.verify') {
    const { token } = payload || {};
    if (!token) return cors({ valid: false });
    const session = verifySessionToken(token);
    if (!session) return cors({ valid: false });

    // Check tenant still exists and isn't suspended
    const { data: tenant } = await db.from('tenants').select('id,role,status,company,email').eq('id', session.tenantId).maybeSingle();
    if (!tenant || tenant.status === 'suspended') return cors({ valid: false });

    return cors({ valid: true, session: { ...session, company: tenant.company, email: tenant.email } });
  }

  // ── All remaining actions require a valid session token
  const token = (event.headers['x-session-token'] || body.token || '');
  const session = verifySessionToken(token);
  if (!session) return err('Unauthorized — invalid or expired session', 401);

  const tenantId = session.tenantId;
  const role     = session.role;

  // ============================================================
  // SYNC.PULL — load all tenant data from Supabase
  // ============================================================
  if (action === 'sync.pull') {
    try {
      const [
        { data: settings },
        { data: invoices },
        { data: customers },
        { data: payments },
        { data: expenses },
        { data: taxPayments },
        { data: emailLog },
      ] = await Promise.all([
        db.from('settings')     .select('*').eq('tenant_id', tenantId).maybeSingle(),
        db.from('invoices')     .select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }),
        db.from('customers')    .select('*').eq('tenant_id', tenantId).order('name'),
        db.from('payments')     .select('*').eq('tenant_id', tenantId).order('date', { ascending: false }),
        db.from('expenses')     .select('*').eq('tenant_id', tenantId).order('date', { ascending: false }),
        db.from('tax_payments') .select('*').eq('tenant_id', tenantId).order('date', { ascending: false }),
        db.from('email_log')    .select('*').eq('tenant_id', tenantId).order('ts', { ascending: false }).limit(500),
      ]);

      // Map DB column names back to frontend camelCase
      const mapInvoice = r => ({
        id: r.id, number: r.number, date: r.date, due: r.due, status: r.status,
        custName: r.cust_name, custPhone: r.cust_phone, custEmail: r.cust_email, custAddr: r.cust_addr,
        notes: r.notes, items: r.items || [], subtotal: r.subtotal, total: r.total,
        discountEnabled: r.discount_enabled, discountType: r.discount_type,
        discountValue: r.discount_value, discountLabel: r.discount_label, discountAmt: r.discount_amt,
        refundPolicy: r.refund_policy, clientObligations: r.client_obligations,
        lastEmailSent: r.last_email_sent,
      });

      const mapPayment = r => ({
        id: r.id, type: r.type, invoiceId: r.invoice_id, invoiceNumber: r.invoice_number,
        customer: r.customer, employer: r.employer, salaryType: r.salary_type,
        paye: r.paye, uif: r.uif, amount: r.amount, date: r.date, method: r.method,
        ref: r.ref, notes: r.notes, proofName: r.proof_name, proofData: r.proof_data,
      });

      const mapExpense = r => ({
        id: r.id, date: r.date, amount: r.amount, category: r.category,
        method: r.method, desc: r.description, notes: r.notes,
        receiptName: r.receipt_name, receiptData: r.receipt_data,
      });

      const mapTaxPayment = r => ({
        id: r.id, fy: r.fy, amount: r.amount, date: r.date,
        type: r.type, ref: r.ref, notes: r.notes,
      });

      const mapEmailLog = r => ({
        id: r.id, ts: r.ts, type: r.type, to: r.to_email, toName: r.to_name,
        subject: r.subject, body: r.body, cc: r.cc, bcc: r.bcc,
        invoiceId: r.invoice_id, invoiceNum: r.invoice_num, status: r.status, note: r.note,
      });

      const mapSettings = s => s ? {
        company: s.company, tagline: s.tagline, owner: s.owner, phone: s.phone,
        email: s.email, website: s.website, address: s.address,
        bank: s.bank, accHolder: s.acc_holder, accNum: s.acc_num, branch: s.branch, accType: s.acc_type,
        taxNum: s.tax_num, fyStart: s.fy_start, bkEmail: s.bk_email,
        defaultRefundPolicy: s.default_refund_policy, defaultClientObligations: s.default_client_obligations,
        logoData: s.logo_data,
        themeAccent: s.theme_accent, themeBg: s.theme_bg, themeBodyFont: s.theme_body_font,
        themeHeadingFont: s.theme_heading_font, themeRadius: s.theme_radius,
        invStyle: s.inv_style, invAccentColor: s.inv_accent_color, invFont: s.inv_font,
        nextInvNum: s.next_inv_num || 202600001,
      } : {};

      return cors({
        success: true,
        state: {
          invoices:    (invoices    || []).map(mapInvoice),
          customers:   (customers   || []).map(r => ({ id: r.id, name: r.name, phone: r.phone, email: r.email, addr: r.addr, notes: r.notes })),
          payments:    (payments    || []).map(mapPayment),
          expenses:    (expenses    || []).map(mapExpense),
          taxPayments: (taxPayments || []).map(mapTaxPayment),
          emailLog:    (emailLog    || []).map(mapEmailLog),
          settings:    mapSettings(settings),
          nextInvNum:  settings?.next_inv_num || 202600001,
        }
      });
    } catch (e) {
      return err('Pull failed: ' + e.message, 500);
    }
  }

  // ============================================================
  // SYNC.PUSH — save entire state to Supabase (upsert all records)
  // ============================================================
  if (action === 'sync.push') {
    const { state: s } = payload || {};
    if (!s) return err('Missing state');

    try {
      const ops = [];

      // Settings
      if (s.settings) {
        ops.push(db.from('settings').upsert({
          tenant_id: tenantId,
          company: s.settings.company, tagline: s.settings.tagline,
          owner: s.settings.owner, phone: s.settings.phone, email: s.settings.email,
          website: s.settings.website, address: s.settings.address,
          bank: s.settings.bank, acc_holder: s.settings.accHolder, acc_num: s.settings.accNum,
          branch: s.settings.branch, acc_type: s.settings.accType, tax_num: s.settings.taxNum,
          fy_start: s.settings.fyStart, bk_email: s.settings.bkEmail,
          default_refund_policy: s.settings.defaultRefundPolicy,
          default_client_obligations: s.settings.defaultClientObligations,
          logo_data: s.settings.logoData,
          theme_accent: s.settings.themeAccent, theme_bg: s.settings.themeBg,
          theme_body_font: s.settings.themeBodyFont, theme_heading_font: s.settings.themeHeadingFont,
          theme_radius: s.settings.themeRadius, inv_style: s.settings.invStyle,
          inv_accent_color: s.settings.invAccentColor, inv_font: s.settings.invFont,
          next_inv_num: s.nextInvNum || 202600001,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'tenant_id' }));
      }

      // Invoices
      if (s.invoices?.length) {
        ops.push(db.from('invoices').upsert(s.invoices.map(i => ({
          id: i.id, tenant_id: tenantId,
          number: i.number, date: i.date, due: i.due, status: i.status,
          cust_name: i.custName, cust_phone: i.custPhone, cust_email: i.custEmail, cust_addr: i.custAddr,
          notes: i.notes, items: i.items, subtotal: i.subtotal, total: i.total,
          discount_enabled: i.discountEnabled, discount_type: i.discountType,
          discount_value: i.discountValue, discount_label: i.discountLabel, discount_amt: i.discountAmt,
          refund_policy: i.refundPolicy, client_obligations: i.clientObligations,
          last_email_sent: i.lastEmailSent, updated_at: new Date().toISOString(),
        })), { onConflict: 'id' }));
      }

      // Customers
      if (s.customers?.length) {
        ops.push(db.from('customers').upsert(s.customers.map(c => ({
          id: c.id, tenant_id: tenantId, name: c.name, phone: c.phone,
          email: c.email, addr: c.addr, notes: c.notes,
        })), { onConflict: 'id' }));
      }

      // Payments
      if (s.payments?.length) {
        ops.push(db.from('payments').upsert(s.payments.map(p => ({
          id: p.id, tenant_id: tenantId, type: p.type,
          invoice_id: p.invoiceId, invoice_number: p.invoiceNumber, customer: p.customer,
          employer: p.employer, salary_type: p.salaryType, paye: p.paye, uif: p.uif,
          amount: p.amount, date: p.date, method: p.method, ref: p.ref, notes: p.notes,
          proof_name: p.proofName, proof_data: p.proofData,
        })), { onConflict: 'id' }));
      }

      // Expenses
      if (s.expenses?.length) {
        ops.push(db.from('expenses').upsert(s.expenses.map(e => ({
          id: e.id, tenant_id: tenantId, date: e.date, amount: e.amount,
          category: e.category, method: e.method, description: e.desc, notes: e.notes,
          receipt_name: e.receiptName, receipt_data: e.receiptData,
        })), { onConflict: 'id' }));
      }

      // Tax payments
      if (s.taxPayments?.length) {
        ops.push(db.from('tax_payments').upsert(s.taxPayments.map(t => ({
          id: t.id, tenant_id: tenantId, fy: t.fy, amount: t.amount,
          date: t.date, type: t.type, ref: t.ref, notes: t.notes,
        })), { onConflict: 'id' }));
      }

      // Email log
      if (s.emailLog?.length) {
        ops.push(db.from('email_log').upsert(s.emailLog.map(e => ({
          id: e.id, tenant_id: tenantId, ts: e.ts, type: e.type,
          to_email: e.to, to_name: e.toName, subject: e.subject, body: e.body,
          cc: e.cc, bcc: e.bcc, invoice_id: e.invoiceId, invoice_num: e.invoiceNum,
          status: e.status, note: e.note,
        })), { onConflict: 'id' }));
      }

      // Run all upserts in parallel
      const results = await Promise.all(ops);
      const errors  = results.filter(r => r.error).map(r => r.error.message);
      if (errors.length) return err('Partial save error: ' + errors.join('; '), 500);

      return cors({ success: true, pushed: {
        invoices: s.invoices?.length || 0, customers: s.customers?.length || 0,
        payments: s.payments?.length || 0, expenses: s.expenses?.length || 0,
      }});
    } catch (e) {
      return err('Push failed: ' + e.message, 500);
    }
  }

  // ============================================================
  // SYNC.DELETE_RECORD — delete a single record by table + id
  // ============================================================
  if (action === 'sync.delete') {
    const { table, id } = payload || {};
    const ALLOWED = ['invoices','customers','payments','expenses','tax_payments','email_log'];
    if (!ALLOWED.includes(table)) return err('Invalid table');

    const { error } = await db.from(table).delete().eq('id', id).eq('tenant_id', tenantId);
    if (error) return err('Delete failed: ' + error.message, 500);
    return cors({ success: true });
  }

  // ============================================================
  // TENANTS.LIST — list all tenants (superadmin only)
  // ============================================================
  if (action === 'tenants.list') {
    if (role !== 'superadmin') return err('Forbidden', 403);
    const { data, error } = await db.from('tenants').select('*').neq('id', 'admin').order('created_at');
    if (error) return err(error.message, 500);
    return cors({ success: true, tenants: data });
  }

  // ============================================================
  // TENANTS.UPSERT — create or update a tenant (superadmin only)
  // ============================================================
  if (action === 'tenants.upsert') {
    if (role !== 'superadmin') return err('Forbidden', 403);
    const t = payload?.tenant;
    if (!t) return err('Missing tenant data');

    // Hash password if provided in plain text
    if (t.plainPassword) {
      t.password_hash = sha256(t.plainPassword);
      delete t.plainPassword;
    }

    const { error } = await db.from('tenants').upsert({
      id: t.id, company: t.company, contact: t.contact, email: t.email, phone: t.phone,
      username: t.username, password_hash: t.password_hash || t.passwordHash,
      role: t.role || 'admin', status: t.status || 'active',
      retainer: t.retainer || 0, notes: t.notes,
    }, { onConflict: 'id' });
    if (error) return err('Tenant save failed: ' + error.message, 500);

    // Create default settings row for new tenants
    await db.from('settings').upsert({
      tenant_id: t.id, company: t.company, owner: t.contact, email: t.email, fy_start: 3, next_inv_num: 202600001,
    }, { onConflict: 'tenant_id', ignoreDuplicates: true });

    return cors({ success: true });
  }

  // ============================================================
  // TENANTS.DELETE — delete tenant + cascade all their data
  // ============================================================
  if (action === 'tenants.delete') {
    if (role !== 'superadmin') return err('Forbidden', 403);
    const { id } = payload || {};
    if (!id || id === 'admin') return err('Cannot delete admin tenant');

    const { error } = await db.from('tenants').delete().eq('id', id);
    if (error) return err('Delete failed: ' + error.message, 500);
    return cors({ success: true });
  }

  // ============================================================
  // AUTH.CHANGE_PASSWORD
  // ============================================================
  if (action === 'auth.change_password') {
    const { currentHash, newHash } = payload || {};
    if (!currentHash || !newHash) return err('Missing password data');

    // Verify current password
    const { data: tenant } = await db.from('tenants').select('password_hash').eq('id', tenantId).maybeSingle();
    if (!tenant || tenant.password_hash !== currentHash) return cors({ success: false, error: 'Current password is incorrect' });

    const { error } = await db.from('tenants').update({ password_hash: newHash }).eq('id', tenantId);
    if (error) return err('Password update failed: ' + error.message, 500);
    return cors({ success: true });
  }

  return err('Unknown action: ' + action);
};
