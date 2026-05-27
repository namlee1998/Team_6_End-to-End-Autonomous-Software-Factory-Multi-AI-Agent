const { Profile } = require('../models');
const { ApiError } = require('../middleware/errorHandler');
const supabase = require('../config/database');
const { SUPABASE_AVATAR_BUCKET } = require('../config/environment');

const FIELD_MAP = {
  full_name: 'full_name',
  age: 'age',
  job_title: 'job_title',
  address: 'address',
  phone: 'phone',
  bio: 'bio',
};

const STRING_FIELDS = ['full_name', 'job_title', 'address', 'phone', 'bio'];
const AVATAR_MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const AVATAR_EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

class ProfileService {
  async getProfile(user) {
    this._requireUser(user);
    return Profile.findByUserId(user.id);
  }

  async upsertProfile(user, payload) {
    this._requireUser(user);
    const data = this._sanitizePayload(payload, { partial: false });
    return Profile.upsert(user.id, data);
  }

  async updateProfile(user, payload) {
    this._requireUser(user);
    const data = this._sanitizePayload(payload, { partial: true });
    if (Object.keys(data).length === 0) {
      throw new ApiError(400, 'At least one profile field is required');
    }

    const existing = await Profile.findByUserId(user.id);
    if (!existing) {
      return Profile.upsert(user.id, data);
    }
    return Profile.update(user.id, data);
  }

  async deleteProfile(user) {
    this._requireUser(user);
    const existing = await Profile.findByUserId(user.id);
    if (existing?.avatarPath) {
      await this._removeAvatar(existing.avatarPath);
    }
    await Profile.delete(user.id);
    return true;
  }

  async uploadAvatar(user, file) {
    this._requireUser(user);
    this._validateAvatarFile(file);

    const existing = await Profile.findByUserId(user.id);
    const extension = AVATAR_EXTENSIONS[file.mimetype];
    const storagePath = `${user.id}/avatar-${Date.now()}.${extension}`;

    const { error: uploadError } = await supabase
      .storage
      .from(SUPABASE_AVATAR_BUCKET)
      .upload(storagePath, file.buffer, {
        contentType: file.mimetype,
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`Failed to upload avatar: ${uploadError.message}`);
    }

    const { data } = supabase
      .storage
      .from(SUPABASE_AVATAR_BUCKET)
      .getPublicUrl(storagePath);

    if (existing?.avatarPath && existing.avatarPath !== storagePath) {
      await this._removeAvatar(existing.avatarPath);
    }

    return Profile.upsert(user.id, {
      avatar_url: data.publicUrl,
      avatar_path: storagePath,
    });
  }

  emptyProfileForUser(user) {
    this._requireUser(user);
    return {
      userId: user.id,
      fullName: null,
      age: null,
      jobTitle: null,
      address: null,
      phone: null,
      bio: null,
      avatarUrl: null,
      avatarPath: null,
      createdAt: null,
      updatedAt: null,
    };
  }

  _requireUser(user) {
    if (!user?.id) {
      throw new ApiError(401, 'Authenticated user is required');
    }
  }

  _sanitizePayload(payload = {}, { partial }) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new ApiError(400, 'Profile payload must be an object');
    }

    const unknownFields = Object.keys(payload).filter((key) => !FIELD_MAP[key]);
    if (unknownFields.length > 0) {
      throw new ApiError(400, `Unknown profile field: ${unknownFields[0]}`);
    }

    const data = {};

    for (const field of STRING_FIELDS) {
      if (!partial || Object.prototype.hasOwnProperty.call(payload, field)) {
        data[field] = this._sanitizeString(payload[field], field);
      }
    }

    if (!partial || Object.prototype.hasOwnProperty.call(payload, 'age')) {
      data.age = this._sanitizeAge(payload.age);
    }

    return data;
  }

  _sanitizeString(value, field) {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value !== 'string') {
      throw new ApiError(400, `${field} must be a string`);
    }
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  _sanitizeAge(value) {
    if (value === undefined || value === null || value === '') return null;
    if (!Number.isInteger(value) || value < 0 || value > 150) {
      throw new ApiError(400, 'age must be an integer between 0 and 150');
    }
    return value;
  }

  _validateAvatarFile(file) {
    if (!file) {
      throw new ApiError(400, 'Avatar file is required');
    }
    if (!ALLOWED_AVATAR_TYPES.has(file.mimetype)) {
      throw new ApiError(400, 'Avatar must be a JPEG, PNG, WEBP, or GIF image');
    }
    if (file.size > AVATAR_MAX_FILE_SIZE) {
      throw new ApiError(400, 'Avatar file size must be 5MB or less');
    }
  }

  async _removeAvatar(path) {
    try {
      await supabase
        .storage
        .from(SUPABASE_AVATAR_BUCKET)
        .remove([path]);
    } catch (error) {
      console.warn('[ProfileService] Avatar not found in storage:', path);
    }
  }
}

module.exports = new ProfileService();
