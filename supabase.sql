-- BrDias Lanches — banco de dados Supabase
-- Execute este arquivo no SQL Editor do seu projeto Supabase.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  role text not null default 'customer' check (role in ('customer','owner','courier')),
  full_name text,
  instagram text,
  whatsapp text,
  cep text,
  address text,
  city text,
  reference text,
  location_url text,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, lower(new.email), 'customer')
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null check (category in ('Lanches','Bebidas','Porções')),
  description text,
  price numeric(10,2) not null check (price > 0),
  image_url text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id),
  total numeric(10,2) not null check (total >= 0),
  status text not null default 'pending' check (status in ('pending','accepted','preparing','ready','out_for_delivery','delivered','cancelled')),
  notes text,
  delivery_address text not null,
  customer_name text not null,
  customer_whatsapp text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  unit_price numeric(10,2) not null,
  quantity integer not null check (quantity > 0)
);

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

-- Função auxiliar para verificar o perfil sem recursão nas políticas.
create or replace function public.current_user_role()
returns text language sql stable security definer set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

drop policy if exists "profile read own or owner" on public.profiles;
create policy "profile read own or owner" on public.profiles for select to authenticated
using (id = auth.uid() or public.current_user_role() = 'owner');

drop policy if exists "profile update own or owner" on public.profiles;
create policy "profile update own or owner" on public.profiles for update to authenticated
using (id = auth.uid() or public.current_user_role() = 'owner')
with check (id = auth.uid() or public.current_user_role() = 'owner');

drop policy if exists "profile insert own" on public.profiles;
create policy "profile insert own" on public.profiles for insert to authenticated
with check (id = auth.uid());

drop policy if exists "products public read active" on public.products;
create policy "products public read active" on public.products for select
using (active = true or public.current_user_role() = 'owner');

drop policy if exists "products owner insert" on public.products;
create policy "products owner insert" on public.products for insert to authenticated
with check (public.current_user_role() = 'owner');

drop policy if exists "products owner update" on public.products;
create policy "products owner update" on public.products for update to authenticated
using (public.current_user_role() = 'owner')
with check (public.current_user_role() = 'owner');

drop policy if exists "orders customer or owner or courier read" on public.orders;
create policy "orders customer or owner or courier read" on public.orders for select to authenticated
using (customer_id = auth.uid() or public.current_user_role() in ('owner','courier'));

drop policy if exists "orders customer insert" on public.orders;
create policy "orders customer insert" on public.orders for insert to authenticated
with check (customer_id = auth.uid());

drop policy if exists "orders owner or courier update" on public.orders;
create policy "orders owner or courier update" on public.orders for update to authenticated
using (public.current_user_role() in ('owner','courier'))
with check (public.current_user_role() in ('owner','courier'));

drop policy if exists "items read related orders" on public.order_items;
create policy "items read related orders" on public.order_items for select to authenticated
using (exists (select 1 from public.orders o where o.id = order_id and (o.customer_id = auth.uid() or public.current_user_role() in ('owner','courier'))));

drop policy if exists "items customer insert own order" on public.order_items;
create policy "items customer insert own order" on public.order_items for insert to authenticated
with check (exists (select 1 from public.orders o where o.id = order_id and o.customer_id = auth.uid()));

-- Armazenamento público de imagens dos produtos (máximo recomendado: 2 MB por foto).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images','product-images',true,2097152,array['image/jpeg','image/png','image/gif'])
on conflict (id) do update set public = true, file_size_limit = 2097152;

drop policy if exists "product images public read" on storage.objects;
create policy "product images public read" on storage.objects for select
using (bucket_id = 'product-images');

drop policy if exists "owner upload product images" on storage.objects;
create policy "owner upload product images" on storage.objects for insert to authenticated
with check (bucket_id = 'product-images' and public.current_user_role() = 'owner');

drop policy if exists "owner update product images" on storage.objects;
create policy "owner update product images" on storage.objects for update to authenticated
using (bucket_id = 'product-images' and public.current_user_role() = 'owner')
with check (bucket_id = 'product-images' and public.current_user_role() = 'owner');

-- IMPORTANTE: após criar sua conta pelo aplicativo, promova seu usuário a proprietário:
-- update public.profiles set role = 'owner' where email = 'SEU_EMAIL_AQUI';
