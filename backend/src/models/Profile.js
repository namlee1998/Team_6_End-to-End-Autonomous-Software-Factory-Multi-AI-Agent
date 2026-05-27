const supabase = require('../config/database');

class ProfileModel {
  static async findByUserId(userId) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return this._map(data);
  }

  static async upsert(userId, data) {
    const { data: record, error } = await supabase
      .from('profiles')
      .upsert(
        {
          user_id: userId,
          ...data,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      )
      .select()
      .single();

    if (error) throw error;
    return this._map(record);
  }

  static async update(userId, data) {
    const { data: record, error } = await supabase
      .from('profiles')
      .update({
        ...data,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return this._map(record);
  }

  static async delete(userId) {
    const { error } = await supabase
      .from('profiles')
      .delete()
      .eq('user_id', userId);

    if (error) throw error;
  }

  static _map(row) {
    if (!row) return null;
    return {
      userId: row.user_id,
      fullName: row.full_name,
      age: row.age,
      jobTitle: row.job_title,
      address: row.address,
      phone: row.phone,
      bio: row.bio,
      avatarUrl: row.avatar_url,
      avatarPath: row.avatar_path,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

module.exports = ProfileModel;
