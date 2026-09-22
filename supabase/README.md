# Supabase setup

1. Create a new project in Supabase.
2. Open SQL Editor and run the contents of `schema.sql`.
3. In Project Settings > API, copy the Project URL and anon/service role keys.
4. Paste them into the `.env` file at the project root.
5. Enable Authentication and configure the admin login method.
6. Enable Realtime for `queue_entries` and related queue tables.

> The starter SQL enables public read/write access for demo/testing. For a production deployment, replace these policies with stricter RLS rules tied to authenticated admin roles.
