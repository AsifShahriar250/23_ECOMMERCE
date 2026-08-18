import pkg from "pg";
const { Client } = pkg;

const database = new Client({
  user:  "postgres",
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: "mysecret123",
  port: process.env.DB_PORT,
});

try {
  await database.connect();
  console.log("Database connected successfully");
} catch (error) {
  console.error("Database connection failed:", error);
  process.exit(1);
}

export default database;
