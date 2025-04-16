# Database configuration

I use Postgres on Supabase

## Table definitions

### sessions

```
create table public.sessions (
  id text not null,
  events jsonb null,
  start_time timestamp with time zone null,
  end_time timestamp with time zone null,
  url text null,
  viewport_size text null,
  created_at timestamp with time zone null default timezone ('utc'::text, now()),
  user_agent text null,
  screen_resolution text null,
  referrer text null,
  constraint sessions_pkey primary key (id)
) TABLESPACE pg_default;
```

### session_chunks

```
create table public.session_chunks (
  id uuid not null default extensions.uuid_generate_v4 (),
  session_id text null,
  events jsonb null,
  start_time bigint null,
  end_time bigint null,
  created_at timestamp with time zone null default timezone ('utc'::text, now()),
  hash text null,
  constraint session_chunks_pkey primary key (id),
  constraint session_chunks_session_id_fkey foreign KEY (session_id) references sessions (id) on delete CASCADE
) TABLESPACE pg_default;
```

### api_keys

```
create table public.api_keys (
  id uuid not null default gen_random_uuid (),
  key text not null,
  allowed_url text not null,
  created_at timestamp with time zone not null default timezone ('utc'::text, now()),
  constraint api_keys_pkey primary key (id),
  constraint api_keys_key_key unique (key)
) TABLESPACE pg_default;

create index IF not exists api_keys_key_idx on public.api_keys using btree (key) TABLESPACE pg_default;
```
