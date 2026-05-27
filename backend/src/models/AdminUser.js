const supabase = require('../config/database');
const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 12;

class AdminUserModel {
  static async create({ email, password, fullName }) {
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const { data, error } = await supabase
      .from('admin_users')
      .insert([{
        email: email.toLowerCase().trim(),
        password_hash: passwordHash,
        full_name: fullName || null,
      }])
      .select()
      .single();
    if (error) throw error;
    return this._mapSafe(data);
  }

  static async findByEmail(email) {
    const { data, error } = await supabase
      .from('admin_users')
      .select('*')
      .eq('email', email.toLowerCase().trim())
      .single();
    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return data; // full row including password_hash — only used internally
  }

  static async findById(id) {
    const { data, error } = await supabase
      .from('admin_users')
      .select('*')
      .eq('id', id)
      .single();
    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return this._mapSafe(data);
  }

  static async verifyPassword(plaintext, hash) {
    return bcrypt.compare(plaintext, hash);
  }

  static _mapSafe(row) {
    if (!row) return null;
    return {
      id: row.id,
      email: row.email,
      fullName: row.full_name,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

module.exports = AdminUserModel;
