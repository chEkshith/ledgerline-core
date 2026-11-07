-- ==============================================================================
-- Migration: 001_schemas_roles_extensions.sql
-- Description: Sets up roles, schemas, extensions, and schema security baseline.
-- ==============================================================================

-- 1. Create owner role if it does not already exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ledgerline_owner') THEN
        CREATE ROLE ledgerline_owner WITH 
            NOLOGIN 
            NOSUPERUSER 
            NOINHERIT 
            NOCREATEDB 
            NOCREATEROLE 
            NOREPLICATION;
    END IF;
END $$;

-- 2. Create runtime application role if it does not already exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ledgerline_app') THEN
        CREATE ROLE ledgerline_app WITH 
            LOGIN 
            NOSUPERUSER 
            NOINHERIT 
            NOCREATEDB 
            NOCREATEROLE 
            NOREPLICATION;
    END IF;
END $$;

-- 3. Create private security schema and public schema
CREATE SCHEMA IF NOT EXISTS ledger_secure;
CREATE SCHEMA IF NOT EXISTS public;

-- 4. Install cryptographic extension into ledger_secure
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA ledger_secure;

-- 5. Revoke default privileges from PUBLIC on schemas
REVOKE ALL ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON SCHEMA ledger_secure FROM PUBLIC;

-- 6. Grant USAGE on schemas to owner and app
GRANT USAGE ON SCHEMA public TO ledgerline_owner, ledgerline_app;
GRANT USAGE ON SCHEMA ledger_secure TO ledgerline_owner, ledgerline_app;

-- 7. Grant schema creation to owner, revoke from app
GRANT CREATE ON SCHEMA public TO ledgerline_owner;
GRANT CREATE ON SCHEMA ledger_secure TO ledgerline_owner;
REVOKE CREATE ON SCHEMA public FROM ledgerline_app;
REVOKE CREATE ON SCHEMA ledger_secure FROM ledgerline_app;

