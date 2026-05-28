const ProfileService = require("../services/ProfileService");

const toResponse = (profile, user) => ({
  user_id: profile.userId,
  email: user?.email || null,
  full_name: profile.fullName,
  age: profile.age,
  job_title: profile.jobTitle,
  address: profile.address,
  phone: profile.phone,
  bio: profile.bio,
  avatar_url: profile.avatarUrl,
  created_at: profile.createdAt,
  updated_at: profile.updatedAt,
});

class ProfileController {
  async get(req, res, next) {
    try {
      const profile = await ProfileService.getProfile(req.user);
      const data = profile || ProfileService.emptyProfileForUser(req.user);
      return res.json({
        status: "success",
        data: toResponse(data, req.user),
      });
    } catch (error) {
      next(error);
    }
  }

  async create(req, res, next) {
    try {
      const profile = await ProfileService.upsertProfile(req.user, req.body);
      return res.status(201).json({
        status: "success",
        data: toResponse(profile, req.user),
      });
    } catch (error) {
      next(error);
    }
  }

  async update(req, res, next) {
    try {
      const profile = await ProfileService.updateProfile(req.user, req.body);
      return res.json({
        status: "success",
        data: toResponse(profile, req.user),
      });
    } catch (error) {
      next(error);
    }
  }

  async delete(req, res, next) {
    try {
      await ProfileService.deleteProfile(req.user);
      return res.json({
        status: "success",
        message: "Profile deleted successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  async uploadAvatar(req, res, next) {
    try {
      const profile = await ProfileService.uploadAvatar(req.user, req.file);
      return res.json({
        status: "success",
        data: toResponse(profile, req.user),
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new ProfileController();
