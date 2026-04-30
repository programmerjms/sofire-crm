-- ============================================================
-- Sofire-IT CRM — Schema Part 1: TABLES
-- Paste this in Supabase SQL Editor and click Run
-- ============================================================

create extension if not exists "uuid-ossp";

create table if not exists tenants (
  id            text primary key,
  company       text,
  contact       text,
  email         text,
  phone         text,
  username      text unique not null,
  password_hash text not null,
  role          text not null default 'admin',
  status        text not null default 'active',
  retainer      numeric(10,2) default 0,
  notes         text,
  created_at    timestamptz default now()
);

create table if not exists settings (
  tenant_id                  text primary key references tenants(id) on delete cascade,
  company                    text,
  tagline                    text,
  owner                      text,
  phone                      text,
  email                      text,
  website                    text,
  address                    text,
  bank                       text,
  acc_holder                 text,
  acc_num                    text,
  branch                     text,
  acc_type                   text,
  tax_num                    text,
  fy_start                   int default 3,
  bk_email                   text,
  default_refund_policy      text,
  default_client_obligations text,
  logo_data                  text,
  theme_accent               text,
  theme_bg                   text,
  theme_body_font            text,
  theme_heading_font         text,
  theme_radius               int,
  inv_style                  text,
  inv_accent_color           text,
  inv_font                   text,
  next_inv_num               bigint default 202600001,
  updated_at                 timestamptz default now()
);

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
  items                jsonb,
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

create table if not exists payments (
  id             text primary key,
  tenant_id      text not null references tenants(id) on delete cascade,
  type           text default 'invoice',
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
  proof_data     text,
  created_at     timestamptz default now()
);
create index if not exists payments_tenant_idx on payments(tenant_id);
create index if not exists payments_date_idx   on payments(tenant_id, date);

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
  receipt_data text,
  created_at   timestamptz default now()
);
create index if not exists expenses_tenant_idx on expenses(tenant_id);
create index if not exists expenses_date_idx   on expenses(tenant_id, date);

create table if not exists tax_payments (
  id         text primary key,
  tenant_id  text not null references tenants(id) on delete cascade,
  fy         text not null,
  amount     numeric(12,2) not null,
  date       text not null,
  type       text,
  ref        text,
  notes      text,
  created_at timestamptz default now()
);
create index if not exists tax_payments_tenant_idx on tax_payments(tenant_id);

create table if not exists email_log (
  id          text primary key,
  tenant_id   text not null references tenants(id) on delete cascade,
  ts          timestamptz default now(),
  type        text default 'other',
  to_email    text,
  to_name     text,
  subject     text,
  body        text,
  cc          text,
  bcc         text,
  invoice_id  text,
  invoice_num text,
  status      text default 'sent',
  note        text
);
create index if not exists email_log_tenant_idx on email_log(tenant_id);
