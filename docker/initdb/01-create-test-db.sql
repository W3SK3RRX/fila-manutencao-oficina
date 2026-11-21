-- Runs once, on first container start, via docker-entrypoint-initdb.d.
-- The default POSTGRES_DB (motomais) already exists by the time this runs;
-- this adds a second database on the same instance for integration tests.
CREATE DATABASE motomais_test;
