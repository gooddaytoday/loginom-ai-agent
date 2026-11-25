#!/bin/sh
# MS SQL on Linux has no BULK INSERT CODEPAGE: load UTF-16 copies of the seed CSVs as widechar.
set -e
cd /opt/loginom-testdb
mkdir -p seed16
for f in seed/*.csv; do iconv -f UTF-8 -t UTF-16 "$f" > "seed16/$(basename "$f")"; done
docker compose cp seed16 mssql:/seed16 >/dev/null
SQLCMD='/opt/mssql-tools18/bin/sqlcmd -C -b -S localhost -U sa -P "$MSSQL_SA_PASSWORD"'
docker compose exec -T mssql sh -c "$SQLCMD -d sales -i /dev/stdin" <<'SQL'
DROP TABLE IF EXISTS order_items, orders, products, customers;
CREATE TABLE customers (customer_id int PRIMARY KEY, full_name nvarchar(200), region nvarchar(100), segment nvarchar(50), signup_date date, email nvarchar(200) NULL);
CREATE TABLE products (product_id int PRIMARY KEY, product_name nvarchar(200), category nvarchar(100), list_price decimal(12,2));
CREATE TABLE orders (order_id int PRIMARY KEY, customer_id int, order_date date, status nvarchar(50));
CREATE TABLE order_items (item_id int PRIMARY KEY, order_id int, product_id int, quantity int, unit_price decimal(12,2), discount_pct int NULL);
BULK INSERT customers FROM '/seed16/customers.csv' WITH (FORMAT='CSV', FIRSTROW=2, DATAFILETYPE='widechar', ROWTERMINATOR='\r\n', KEEPNULLS);
BULK INSERT products FROM '/seed16/products.csv' WITH (FORMAT='CSV', FIRSTROW=2, DATAFILETYPE='widechar', ROWTERMINATOR='\r\n', KEEPNULLS);
BULK INSERT orders FROM '/seed16/orders.csv' WITH (FORMAT='CSV', FIRSTROW=2, DATAFILETYPE='widechar', ROWTERMINATOR='\r\n', KEEPNULLS);
BULK INSERT order_items FROM '/seed16/order_items.csv' WITH (FORMAT='CSV', FIRSTROW=2, DATAFILETYPE='widechar', ROWTERMINATOR='\r\n', KEEPNULLS);
GO
SQL
echo "== counts (customers, products, orders, items, null emails, revenue, sample region)"
docker compose exec -T postgres sh -c 'psql -U postgres -d sales -At -c "select (select count(*) from customers),(select count(*) from products),(select count(*) from orders),(select count(*) from order_items),(select count(*) from customers where email is null),(select round(sum(quantity*unit_price),2) from order_items),(select region from customers where customer_id=1)"'
docker compose exec -T mysql sh -c 'mysql --default-character-set=utf8mb4 -uroot -p"$MYSQL_ROOT_PASSWORD" sales -N -e "select (select count(*) from customers),(select count(*) from products),(select count(*) from orders),(select count(*) from order_items),(select count(*) from customers where email is null),(select round(sum(quantity*unit_price),2) from order_items),(select region from customers where customer_id=1)" 2>/dev/null'
docker compose exec -T mssql sh -c "$SQLCMD -d sales -h -1 -W -s '|' -Q \"set nocount on; select (select count(*) from customers),(select count(*) from products),(select count(*) from orders),(select count(*) from order_items),(select count(*) from customers where email is null),(select cast(sum(quantity*unit_price) as decimal(18,2)) from order_items),(select region from customers where customer_id=1)\""
docker compose exec -T mssql sh -c '/opt/mssql-tools18/bin/sqlcmd -C -b -S localhost -U sa -P "$MSSQL_SA_PASSWORD" -d sales -h -1 -W -i /dev/stdin' <<'SQL'
set nocount on;
update customers set email = NULL where email = N'';
select count(*) from customers where email is null;
select count(*) from orders where status like N'%' + nchar(13);
select count(*) from orders where status = N'Выполнен';
GO
SQL
