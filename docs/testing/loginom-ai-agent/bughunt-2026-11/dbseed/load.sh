#!/bin/sh
# Runs on the DB server in /opt/loginom-testdb: creates DB "sales" and user "loginom" in PostgreSQL, MySQL and MS SQL,
# then loads seed/*.csv. Passwords come from the containers' environment (compose .env), never from arguments.
set -e
cd /opt/loginom-testdb
for c in postgres mysql mssql; do docker compose cp seed "$c":/seed >/dev/null; done

until docker compose exec -T postgres pg_isready -U postgres >/dev/null 2>&1; do sleep 2; done
docker compose exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -U postgres -q' <<'SQL'
SELECT 'CREATE DATABASE sales' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname='sales')\gexec
SQL
docker compose exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -U postgres -q -v pw="$LOGINOM_PW" -d sales' <<'SQL'
DO $$BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='loginom') THEN CREATE ROLE loginom LOGIN; END IF; END$$;
ALTER ROLE loginom PASSWORD :'pw';
DROP TABLE IF EXISTS order_items, orders, products, customers;
CREATE TABLE customers (customer_id int PRIMARY KEY, full_name text, region text, segment text, signup_date date, email text);
CREATE TABLE products (product_id int PRIMARY KEY, product_name text, category text, list_price numeric(12,2));
CREATE TABLE orders (order_id int PRIMARY KEY, customer_id int REFERENCES customers, order_date date, status text);
CREATE TABLE order_items (item_id int PRIMARY KEY, order_id int REFERENCES orders, product_id int REFERENCES products, quantity int, unit_price numeric(12,2), discount_pct int);
\copy customers FROM '/seed/customers.csv' WITH (FORMAT csv, HEADER true)
\copy products FROM '/seed/products.csv' WITH (FORMAT csv, HEADER true)
\copy orders FROM '/seed/orders.csv' WITH (FORMAT csv, HEADER true)
\copy order_items FROM '/seed/order_items.csv' WITH (FORMAT csv, HEADER true)
GRANT CONNECT ON DATABASE sales TO loginom; GRANT USAGE, CREATE ON SCHEMA public TO loginom;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO loginom;
SQL

until docker compose exec -T mysql sh -c 'mysqladmin ping -uroot -p"$MYSQL_ROOT_PASSWORD" --silent' >/dev/null 2>&1; do sleep 2; done
docker compose exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -e "SET GLOBAL local_infile=1; CREATE DATABASE IF NOT EXISTS sales CHARACTER SET utf8mb4; CREATE USER IF NOT EXISTS loginom IDENTIFIED BY \"$LOGINOM_PW\"; ALTER USER loginom IDENTIFIED BY \"$LOGINOM_PW\"; GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, DROP ON sales.* TO loginom;" 2>/dev/null'
docker compose exec -T mysql sh -c 'mysql --local-infile=1 -uroot -p"$MYSQL_ROOT_PASSWORD" sales 2>/dev/null' <<'SQL'
DROP TABLE IF EXISTS order_items, orders, products, customers;
CREATE TABLE customers (customer_id int PRIMARY KEY, full_name varchar(200), region varchar(100), segment varchar(50), signup_date date, email varchar(200));
CREATE TABLE products (product_id int PRIMARY KEY, product_name varchar(200), category varchar(100), list_price decimal(12,2));
CREATE TABLE orders (order_id int PRIMARY KEY, customer_id int, order_date date, status varchar(50));
CREATE TABLE order_items (item_id int PRIMARY KEY, order_id int, product_id int, quantity int, unit_price decimal(12,2), discount_pct int NULL);
LOAD DATA LOCAL INFILE '/seed/customers.csv' INTO TABLE customers CHARACTER SET utf8mb4 FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"' LINES TERMINATED BY '\r\n' IGNORE 1 LINES (customer_id, full_name, region, segment, signup_date, @email) SET email = NULLIF(@email, '');
LOAD DATA LOCAL INFILE '/seed/products.csv' INTO TABLE products CHARACTER SET utf8mb4 FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"' LINES TERMINATED BY '\r\n' IGNORE 1 LINES;
LOAD DATA LOCAL INFILE '/seed/orders.csv' INTO TABLE orders CHARACTER SET utf8mb4 FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"' LINES TERMINATED BY '\r\n' IGNORE 1 LINES;
LOAD DATA LOCAL INFILE '/seed/order_items.csv' INTO TABLE order_items CHARACTER SET utf8mb4 FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"' LINES TERMINATED BY '\r\n' IGNORE 1 LINES (item_id, order_id, product_id, quantity, unit_price, @d) SET discount_pct = NULLIF(@d, '');
SQL

SQLCMD='/opt/mssql-tools18/bin/sqlcmd -C -b -S localhost -U sa -P "$MSSQL_SA_PASSWORD"'
until docker compose exec -T mssql sh -c "$SQLCMD -Q 'SELECT 1'" >/dev/null 2>&1; do sleep 3; done
docker compose exec -T mssql sh -c "$SQLCMD -Q \"IF DB_ID('sales') IS NULL CREATE DATABASE sales;\""
docker compose exec -T mssql sh -c "$SQLCMD -d sales -Q \"IF SUSER_ID('loginom') IS NULL CREATE LOGIN loginom WITH PASSWORD='\$LOGINOM_PW', CHECK_POLICY=OFF; ELSE ALTER LOGIN loginom WITH PASSWORD='\$LOGINOM_PW'; IF USER_ID('loginom') IS NULL CREATE USER loginom FOR LOGIN loginom; ALTER ROLE db_datareader ADD MEMBER loginom; ALTER ROLE db_datawriter ADD MEMBER loginom; GRANT CREATE TABLE TO loginom; GRANT ALTER ON SCHEMA::dbo TO loginom;\""
docker compose exec -T mssql sh -c "$SQLCMD -d sales -i /dev/stdin" <<'SQL'
DROP TABLE IF EXISTS order_items, orders, products, customers;
CREATE TABLE customers (customer_id int PRIMARY KEY, full_name nvarchar(200), region nvarchar(100), segment nvarchar(50), signup_date date, email nvarchar(200) NULL);
CREATE TABLE products (product_id int PRIMARY KEY, product_name nvarchar(200), category nvarchar(100), list_price decimal(12,2));
CREATE TABLE orders (order_id int PRIMARY KEY, customer_id int, order_date date, status nvarchar(50));
CREATE TABLE order_items (item_id int PRIMARY KEY, order_id int, product_id int, quantity int, unit_price decimal(12,2), discount_pct int NULL);
BULK INSERT customers FROM '/seed/customers.csv' WITH (FORMAT='CSV', FIRSTROW=2, CODEPAGE='65001', KEEPNULLS);
BULK INSERT products FROM '/seed/products.csv' WITH (FORMAT='CSV', FIRSTROW=2, CODEPAGE='65001', KEEPNULLS);
BULK INSERT orders FROM '/seed/orders.csv' WITH (FORMAT='CSV', FIRSTROW=2, CODEPAGE='65001', KEEPNULLS);
BULK INSERT order_items FROM '/seed/order_items.csv' WITH (FORMAT='CSV', FIRSTROW=2, CODEPAGE='65001', KEEPNULLS);
GO
SQL

echo "== counts"
docker compose exec -T postgres sh -c 'psql -U postgres -d sales -At -c "select (select count(*) from customers),(select count(*) from products),(select count(*) from orders),(select count(*) from order_items),(select count(*) from customers where email is null),(select round(sum(quantity*unit_price),2) from order_items)"'
docker compose exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" sales -N -e "select (select count(*) from customers),(select count(*) from products),(select count(*) from orders),(select count(*) from order_items),(select count(*) from customers where email is null),(select round(sum(quantity*unit_price),2) from order_items)" 2>/dev/null'
docker compose exec -T mssql sh -c "$SQLCMD -d sales -h -1 -W -Q \"set nocount on; select (select count(*) from customers),(select count(*) from products),(select count(*) from orders),(select count(*) from order_items),(select count(*) from customers where email is null),(select cast(sum(quantity*unit_price) as decimal(18,2)) from order_items)\""
