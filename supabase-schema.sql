-- ============================================================
-- Sofire-IT CRM — Supabase Schema
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- TENANTS
-- One row per portal user (admin = tenant_id 'admin', clients get their own)
-- ============================================================
create table if not exists tenants (
  id            text primary key,          -- 'admin' or 'tmok0027z' etc
  company       text,
  contact       text,
  email         text,
  phone         text,
  username      text unique not null,
  password_hash text not null,
  role          text not null default 'admin',  -- superadmin | admin | viewer
  status        text not null default 'active', -- active | suspended | trial
  retainer      numeric(10,2) default 0,
  notes         text,
  created_at    timestamptz default now()
);

-- ============================================================
-- SETTINGS (one row per tenant)
-- ============================================================
create table if not exists settings (
  tenant_id             text primary key references tenants(id) on delete cascade,
  company               text,
  tagline               text,
  owner                 text,
  phone                 text,
  email                 text,
  website               text,
  address               text,
  bank                  text,
  acc_holder            text,
  acc_num               text,
  branch                text,
  acc_type              text,
  tax_num               text,
  fy_start              int default 3,
  bk_email              text,
  default_refund_policy text,
  default_client_obligations text,
  logo_data             text,         -- base64 string
  theme_accent          text,
  theme_bg              text,
  theme_body_font       text,
  theme_heading_font    text,
  theme_radius          int,
  inv_style             text,
  inv_accent_color      text,
  inv_font              text,
  next_inv_num          bigint default 202600001,
  updated_at            timestamptz default now()
);

-- ============================================================
-- CUSTOMERS
-- ============================================================
create table if not exists customers (
  id         text primary key,
  tenant_id  text not null references tenants(id) on delete cascade,
  name       text not null,
  phone      text,
  email      text,
  addr       text,
  notes      text,
  created_at timestamptz default now()
);
create index if not exists customers_tenant_idx on customers(tenant_id);

-- ============================================================
-- INVOICES
-- ============================================================
create table if not exists invoices (
  id                   text primary key,
  tenant_id            text not null references tenants(id) on delete cascade,
  number               text,
  date                 text,
  due                  text,
  status               text default 'draft',
  cust_name            text,
  cust_phone           text,
  cust_email           text,
  cust_addr            text,
  notes                text,
  items                jsonb,          -- array of line items
  subtotal             numeric(12,2),
  discount_enabled     boolean default false,
  discount_type        text,
  discount_value       numeric(10,2),
  discount_label       text,
  discount_amt         numeric(10,2) default 0,
  total                numeric(12,2),
  refund_policy        text,
  client_obligations   text,
  last_email_sent      timestamptz,
  created_at           timestamptz default now(),
  updated_at           timestamptz default now()
);
create index if not exists invoices_tenant_idx on invoices(tenant_id);
create index if not exists invoices_status_idx on invoices(tenant_id, status);

-- ============================================================
-- PAYMENTS (income records)
-- ============================================================
create table if not exists payments (
  id             text primary key,
  tenant_id      text not null references tenants(id) on delete cascade,
  type           text default 'invoice',  -- invoice | salary
  invoice_id     text,
  invoice_number text,
  customer       text,
  employer       text,
  salary_type    text,
  paye           numeric(10,2) default 0,
  uif            numeric(10,2) default 0,
  amount         numeric(12,2) not null,
  date           text not null,
  method         text default 'EFT',
  ref            text,
  notes          text,
  proof_name     text,
  proof_data     text,                    -- base64
  created_at     timestamptz default now()
);
create index if not exists payments_tenant_idx on payments(tenant_id);
create index if not exists payments_date_idx on payments(tenant_id, date);

-- ============================================================
-- EXPENSES
-- ============================================================
create table if not exists expenses (
  id           text primary key,
  tenant_id    text not null references tenants(id) on delete cascade,
  date         text not null,
  amount       numeric(12,2) not null,
  category     text,
  method       text default 'Bank Transaction',
  description  text,
  notes        text,
  receipt_name text,
  receipt_data text,                    -- base64
  created_at   timestamptz default now()
);
create index if not exists expenses_tenant_idx on expenses(tenant_id);
create index if not exists expenses_date_idx on expenses(tenant_id, date);

-- ============================================================
-- TAX PAYMENTS
-- ============================================================
create table if not exists tax_payments (
  id        text primary key,
  tenant_id text not null references tenants(id) on delete cascade,
  fy        text not null,
  amount    numeric(12,2) not null,
  date      text not null,
  type      text,
  ref       text,
  notes     text,
  created_at timestamptz default now()
);
create index if not exists tax_payments_tenant_idx on tax_payments(tenant_id);

-- ============================================================
-- EMAIL LOG
-- ============================================================
create table if not exists email_log (
  id           text primary key,
  tenant_id    text not null references tenants(id) on delete cascade,
  ts           timestamptz default now(),
  type         text default 'other',
  to_email     text,
  to_name      text,
  subject      text,
  body         text,
  cc           text,
  bcc          text,
  invoice_id   text,
  invoice_num  text,
  status       text default 'sent',
  note         text
);
create index if not exists email_log_tenant_idx on email_log(tenant_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- All tables locked down — only the service role key (used by
-- Netlify functions) can read/write. The anon key is blocked.
-- ============================================================
alter table tenants       enable row level security;
alter table settings      enable row level security;
alter table customers     enable row level security;
alter table invoices      enable row level security;
alter table payments      enable row level security;
alter table expenses      enable row level security;
alter table tax_payments  enable row level security;
alter table email_log     enable row level security;

-- Block all anon/authenticated access (Netlify function uses service role which bypasses RLS)
create policy "deny_anon_tenants"      on tenants      for all using (false);
create policy "deny_anon_settings"     on settings     for all using (false);
create policy "deny_anon_customers"    on customers    for all using (false);
create policy "deny_anon_invoices"     on invoices     for all using (false);
create policy "deny_anon_payments"     on payments     for all using (false);
create policy "deny_anon_expenses"     on expenses     for all using (false);
create policy "deny_anon_tax_payments" on tax_payments for all using (false);
create policy "deny_anon_email_log"    on email_log    for all using (false);

-- ============================================================
-- SEED: Insert admin tenant record
-- Password hash = SHA-256 of 'Sofire@2024!'
-- ============================================================
insert into tenants (id, company, contact, email, username, password_hash, role, status)
values (
  'admin',
  'Sofire-IT Support (Juan Du Plessis Freelance)',
  'Juan Du Plessis',
  'juan@sofire-it.co.za',
  'juan',
  'cf61d5cd29ff916b13dfb741084a066513cb254b5bd720cbdbbdea14247ec97c',
  'superadmin',
  'active'
) on conflict (id) do nothing;

insert into settings (tenant_id, company, owner, email, phone, fy_start, next_inv_num)
values (
  'admin',
  'Sofire-IT Support (Juan Du Plessis Freelance)',
  'Juan Du Plessis',
  'juan@sofire-it.co.za',
  '+27 671 371 638',
  3,
  202600001
) on conflict (tenant_id) do nothing;
