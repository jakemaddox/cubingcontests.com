-- Set up extensions
DROP EXTENSION IF EXISTS pgjwt CASCADE; -- not used for supabase/postgres from PG version 17
CREATE EXTENSION unaccent;
SELECT * FROM pg_extension; -- log available extensions

-- Create Cubing Contests user and schema
\set db_schema `echo "$CC_DB_SCHEMA"`
\set db_username `echo "$CC_DB_USERNAME"`
\set db_password `echo "$CC_DB_PASSWORD"`

CREATE USER :"db_username" WITH PASSWORD :'db_password';
CREATE SCHEMA :"db_schema";
ALTER SCHEMA :"db_schema" OWNER TO :"db_username";

-- I commented this out, because it doesn't work anyways: https://github.com/drizzle-team/drizzle-orm/issues/5274
-- TO-DO: REMOVE THIS PERMISSION ONCE THIS PR IS MERGED!!!!! https://github.com/drizzle-team/drizzle-orm/pull/4025
-- \set db_name `echo "$POSTGRES_DB"`
-- GRANT CREATE ON DATABASE :"db_name" TO :"db_username";