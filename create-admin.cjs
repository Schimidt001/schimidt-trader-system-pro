// Script para criar usuário admin
// Execute com: node create-admin.js

const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');

async function createAdmin() {
  console.log('\n🔐 Criando Usuário Administrador\n');

  // Suas credenciais de admin
  const adminData = {
    name: 'Admin',
    email: 'admin@schimidt.com',
    password: 'admin123', // MUDE ESTA SENHA DEPOIS DO PRIMEIRO LOGIN!
  };

  try {
    // Conectar ao banco
    const connection = await mysql.createConnection({
      host: 'switchyard.proxy.rlwy.net',
      port: 53879,
      user: 'root',
      password: 'VBkWbYXUTRAhzutmRKVhnZHEMyOOmYwg',
      database: 'railway'
    });

    console.log('✅ Conectado ao banco de dados');

    // Hash da senha
    const passwordHash = await bcrypt.hash(adminData.password, 10);
    console.log('✅ Senha criptografada');

    // Verificar se já existe
    const [existing] = await connection.execute(
      'SELECT * FROM users WHERE email = ?',
      [adminData.email]
    );

    if (existing.length > 0) {
      console.log('\n⚠️  Usuário admin já existe!');
      console.log(`Email: ${adminData.email}`);
      console.log('\nSe esqueceu a senha, delete o usuário no banco e execute este script novamente.\n');
      await connection.end();
      return;
    }

    // Criar openId único
    const openId = `local-${adminData.email}`;

    // Inserir usuário
    await connection.execute(
      `INSERT INTO users (openId, name, email, password, loginMethod, role, createdAt, updatedAt, lastSignedIn)
       VALUES (?, ?, ?, ?, 'local', 'admin', NOW(), NOW(), NOW())`,
      [openId, adminData.name, adminData.email, passwordHash]
    );

    console.log('\n✅ Usuário admin criado com sucesso!\n');
    console.log('📧 Email:', adminData.email);
    console.log('🔑 Senha:', adminData.password);
    console.log('\n⚠️  IMPORTANTE: Mude esta senha após o primeiro login!\n');
    console.log('🌐 Acesse a plataforma e faça login com estas credenciais.\n');

    await connection.end();
  } catch (error) {
    console.error('\n❌ Erro:', error.message);
    process.exit(1);
  }
}

createAdmin();
