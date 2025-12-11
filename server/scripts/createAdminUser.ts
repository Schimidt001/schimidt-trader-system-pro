import { AuthService } from '../auth/authService';
import * as readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query: string): Promise<string> {
  return new Promise(resolve => rl.question(query, resolve));
}

async function main() {
  console.log('\n🔐 Criar Usuário Administrador\n');
  console.log('Este script criará o primeiro usuário admin da plataforma.\n');

  try {
    const name = await question('Nome completo: ');
    const email = await question('Email: ');
    const password = await question('Senha (mínimo 6 caracteres): ');

    if (!name || !email || !password) {
      console.error('\n❌ Erro: Todos os campos são obrigatórios');
      process.exit(1);
    }

    if (password.length < 6) {
      console.error('\n❌ Erro: A senha deve ter no mínimo 6 caracteres');
      process.exit(1);
    }

    console.log('\n⏳ Criando usuário admin...');

    const user = await AuthService.createUser({
      name,
      email,
      password,
      role: 'admin'
    });

    console.log('\n✅ Usuário admin criado com sucesso!');
    console.log(`\nID: ${user.id}`);
    console.log(`Nome: ${user.name}`);
    console.log(`Email: ${user.email}`);
    console.log(`Função: ${user.role}`);
    console.log('\n🔑 Use estas credenciais para fazer login na plataforma.\n');

    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ Erro ao criar usuário:', error.message);
    process.exit(1);
  } finally {
    rl.close();
  }
}

main();
