import Database from "better-sqlite3";

const db = new Database("./data/sqlite.db");

const positions = db.prepare(`
  SELECT 
    id,
    direction,
    entryPrice,
    exitPrice,
    pnl,
    status,
    contractId
  FROM positions 
  ORDER BY id DESC 
  LIMIT 10
`).all();

console.log("\n=== POSIÇÕES NO BANCO ===\n");
positions.forEach((p: any) => {
  console.log(`ID: ${p.id}`);
  console.log(`  Direção: ${p.direction}`);
  console.log(`  Entrada: ${p.entryPrice}`);
  console.log(`  Saída: ${p.exitPrice || "N/A"}`);
  console.log(`  PnL (centavos): ${p.pnl}`);
  console.log(`  PnL (dólares): $${(p.pnl / 100).toFixed(2)}`);
  console.log(`  Status: ${p.status}`);
  console.log(`  Contract ID: ${p.contractId}`);
  console.log("---");
});

db.close();

