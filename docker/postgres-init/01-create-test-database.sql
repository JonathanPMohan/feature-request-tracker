-- The image creates feature_requests_dev from POSTGRES_DB.
-- Tests get their own database, so they can wipe tables without touching dev data.
CREATE DATABASE feature_requests_test;
