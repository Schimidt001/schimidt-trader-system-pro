import bcrypt from 'bcryptjs';
import { db } from '../db';
import { users } from '../../drizzle/schema';
import { eq } from 'drizzle-orm';
import type { User } from '../../drizzle/schema';

/**
 * Serviço de autenticação local com senha
 */
export class AuthService {
  /**
   * Hash de senha usando bcrypt
   */
  static async hashPassword(password: string): Promise<string> {
    const saltRounds = 10;
    return bcrypt.hash(password, saltRounds);
  }

  /**
   * Verificar senha
   */
  static async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Criar usuário com senha
   */
  static async createUser(data: {
    email: string;
    password: string;
    name: string;
    role?: 'user' | 'admin';
  }): Promise<User> {
    // Verificar se email já existe
    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.email, data.email))
      .limit(1);

    if (existingUser.length > 0) {
      throw new Error('Email já está em uso');
    }

    // Hash da senha
    const passwordHash = await this.hashPassword(data.password);

    // Criar openId único baseado no email
    const openId = `local-${data.email}`;

    // Inserir usuário
    const [user] = await db.insert(users).values({
      openId,
      email: data.email,
      password: passwordHash,
      name: data.name,
      loginMethod: 'local',
      role: data.role || 'user',
      lastSignedIn: new Date(),
    });

    // Buscar usuário criado
    const [createdUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, user.insertId))
      .limit(1);

    return createdUser;
  }

  /**
   * Autenticar usuário com email e senha
   */
  static async authenticate(email: string, password: string): Promise<User | null> {
    // Buscar usuário por email
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user || !user.password) {
      return null;
    }

    // Verificar senha
    const isValid = await this.verifyPassword(password, user.password);
    if (!isValid) {
      return null;
    }

    // Atualizar lastSignedIn
    await db
      .update(users)
      .set({ lastSignedIn: new Date() })
      .where(eq(users.id, user.id));

    return user;
  }

  /**
   * Atualizar senha do usuário
   */
  static async updatePassword(userId: number, newPassword: string): Promise<void> {
    const passwordHash = await this.hashPassword(newPassword);
    await db
      .update(users)
      .set({ password: passwordHash })
      .where(eq(users.id, userId));
  }

  /**
   * Deletar usuário
   */
  static async deleteUser(userId: number): Promise<void> {
    await db.delete(users).where(eq(users.id, userId));
  }

  /**
   * Listar todos os usuários (apenas admin)
   */
  static async listUsers(): Promise<User[]> {
    return db.select().from(users);
  }

  /**
   * Buscar usuário por ID
   */
  static async getUserById(userId: number): Promise<User | null> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return user || null;
  }

  /**
   * Atualizar informações do usuário
   */
  static async updateUser(
    userId: number,
    data: {
      name?: string;
      email?: string;
      role?: 'user' | 'admin';
    }
  ): Promise<User> {
    await db
      .update(users)
      .set(data)
      .where(eq(users.id, userId));

    const user = await this.getUserById(userId);
    if (!user) {
      throw new Error('Usuário não encontrado');
    }

    return user;
  }
}
