ALTER USER postgres WITH PASSWORD 'postgres';
CREATE DATABASE gazexpress_db;
GRANT ALL PRIVILEGES ON DATABASE gazexpress_db TO postgres;