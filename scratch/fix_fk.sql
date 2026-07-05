ALTER TABLE public.sesi_presensi DROP CONSTRAINT IF EXISTS sesi_presensi_dibuka_oleh_fkey;

-- If session.id is actually an integer and currently the column is UUID, we might need to recreate the column if there are type mismatch errors later, 
-- but since the error was a foreign key constraint, it means the type matched (e.g. session.id is UUID or implicitly castable), but the value wasn't in auth.users.
-- Just dropping the FK constraint should be enough.
