const { v4: uuidv4 } = require('uuid');
const { Document, Project, Folder } = require('../models');
const SessionState = require('../models/SessionState');
const MembershipService = require('./MembershipService');
const supabase = require('../config/database');
const { MAX_FILE_SIZE, SUPABASE_STORAGE_BUCKET } = require('../config/environment');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');
const { ApiError } = require('../middleware/errorHandler');

class DocumentService {
  /**
   * Upload file to Supabase Storage and create document record
   * @param {Object} file - Multer file object
   * @param {string} projectId
   * @param {string|null} folderId - Optional folder ID
   * @returns {Promise<Object>} Document record
   */
  async uploadFile(file, projectId, folderId = null, user) {
    if (!projectId) {
      throw new ApiError(400, 'project_id is required');
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new Error(`File size exceeds maximum allowed size of ${MAX_FILE_SIZE / 1024 / 1024}MB`);
    }
    await MembershipService.requireProjectRole(user.id, projectId, ['owner', 'admin', 'editor']);

    const project = await Project.findById(projectId);
    if (!project) {
      throw new ApiError(404, 'Project not found');
    }

    if (folderId) {
      const folder = await Folder.findById(folderId);
      if (!folder) {
        throw new ApiError(404, 'Folder not found');
      }
      if (folder.projectId !== projectId) {
        throw new ApiError(400, 'folder_id does not belong to project_id');
      }
    }

    const documentId = uuidv4();
    const extension = file.originalname.split('.').pop();
    const storagePath = `${projectId}/${folderId || 'root'}/${documentId}.${extension}`;

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase
      .storage
      .from(SUPABASE_STORAGE_BUCKET)
      .upload(storagePath, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`Failed to upload file: ${uploadError.message}`);
    }

    // Create document record
    const document = await Document.create({
      id: documentId,
      projectId,
      fileName: file.originalname,
      fileType: file.mimetype,
      filePath: storagePath,
      fileSize: file.size,
      folderId,
      status: 'uploaded',
    });

    return document;
  }

  /**
   * Get document by ID
   * @param {string} documentId
   * @returns {Promise<Object|null>} Document record
   */
  async getDocumentById(documentId, user) {
    const document = await Document.findById(documentId);
    if (document && user) {
      await MembershipService.requireProjectRole(user.id, document.projectId, ['owner', 'admin', 'editor', 'viewer']);
    }
    return document;
  }

  /**
   * Get signed URL for a document
   * @param {string} documentId
   * @param {number} expiresIn - URL expiry in seconds
   * @returns {Promise<{url: string}>} Signed URL
   */
  async getSignedUrl(documentId, expiresIn = 3600, user) {
    const document = await Document.findById(documentId);
    if (!document) {
      throw new Error('Document not found');
    }
    if (user) {
      await MembershipService.requireProjectRole(user.id, document.projectId, ['owner', 'admin', 'editor', 'viewer']);
    }

    const { data, error } = await supabase
      .storage
      .from(SUPABASE_STORAGE_BUCKET)
      .createSignedUrl(document.filePath, expiresIn);

    if (error) {
      throw new Error(`Failed to generate signed URL: ${error.message}`);
    }

    return { url: data.signedUrl };
  }

  /**
   * Download file content from Supabase Storage as text
   * @param {string} documentId
   * @returns {Promise<string>} File content as string
   */
  async getContent(documentId, user) {
    const document = await Document.findById(documentId);
    if (!document) {
      throw new Error('Document not found');
    }
    if (user) {
      await MembershipService.requireProjectRole(user.id, document.projectId, ['owner', 'admin', 'editor', 'viewer']);
    }

    // Get signed URL
    const { data: signedData, error: signError } = await supabase
      .storage
      .from(SUPABASE_STORAGE_BUCKET)
      .createSignedUrl(document.filePath, 60); // short-lived URL

    if (signError) {
      throw new Error(`Failed to generate signed URL: ${signError.message}`);
    }

    // Fetch content as buffer
    const res = await fetch(signedData.signedUrl);
    if (!res.ok) {
      throw new Error(`Failed to download file: ${res.status} ${res.statusText}`);
    }

    const fileType = document.fileType?.toLowerCase() || '';
    const fileName = document.fileName?.toLowerCase() || '';

    console.log(`[DocumentService.getContent] fileType="${fileType}" fileName="${fileName}"`);

    // DOCX: extract text via mammoth
    if (fileType.includes('docx') || fileType.includes('wordprocessingml') || fileName.endsWith('.docx')) {
      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const result = await mammoth.extractRawText({ buffer });
      console.log(`[DocumentService.getContent] mammoth extracted ${result.value.length} chars, preview: ${result.value.slice(0, 200)}`);
      return result.value;
    }

    // PDF: extract text via pdf-parse
    if (fileType.includes('pdf') || fileName.endsWith('.pdf')) {
      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const result = await pdfParse(buffer);
      console.log(`[DocumentService.getContent] pdf-parse extracted ${result.text.length} chars`);
      return result.text;
    }

    // Plain text / markdown
    const text = await res.text();
    console.log(`[DocumentService.getContent] plain text ${text.length} chars, preview: ${text.slice(0, 200)}`);
    return text;
  }

  /**
   * Update document status
   * @param {string} documentId
   * @param {string} status
   * @returns {Promise<Object>} Updated document
   */
  async updateStatus(documentId, status) {
    const document = await Document.findById(documentId);
    if (!document) {
      throw new Error('Document not found');
    }
    return Document.update(documentId, { status });
  }

  /**
   * Get all documents
   * @param {Object} options - Query options
   * @returns {Promise<Object>} List of documents with count
   */
  async getAllDocuments(options = {}) {
    const { limit = 50, offset = 0, projectId, user } = options;
    if (projectId) {
      await MembershipService.requireProjectRole(user.id, projectId, ['owner', 'admin', 'editor', 'viewer']);
    } else {
      const accessibleProjectIds = await MembershipService.listAccessibleProjectIds(user.id);
      if (accessibleProjectIds.length === 0) return { rows: [], count: 0 };
      const results = await Promise.all(
        accessibleProjectIds.map((id) => Document.list({ limit: 1000, offset: 0, projectId: id })),
      );
      const rows = results.flatMap((result) => result.rows)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(offset, offset + limit);
      return { rows, count: results.reduce((sum, result) => sum + (result.count || 0), 0) };
    }
    return Document.list({ limit, offset, projectId });
  }

  async renameDocument(documentId, fileName, user) {
    const document = await Document.findById(documentId);
    if (!document) {
      throw new ApiError(404, 'Document not found');
    }
    await MembershipService.requireProjectRole(user.id, document.projectId, ['owner', 'admin', 'editor']);
    if (!fileName || !fileName.trim()) {
      throw new ApiError(400, 'file_name is required');
    }
    return Document.rename(documentId, fileName.trim());
  }

  async moveDocument(documentId, { projectId, folderId, user }) {
    const document = await Document.findById(documentId);
    if (!document) {
      throw new ApiError(404, 'Document not found');
    }
    await MembershipService.requireProjectRole(user.id, document.projectId, ['owner', 'admin', 'editor']);

    const targetProjectId = projectId || document.projectId;
    if (!targetProjectId) {
      throw new ApiError(400, 'project_id is required');
    }
    if (targetProjectId !== document.projectId) {
      await MembershipService.requireProjectRole(user.id, targetProjectId, ['owner', 'admin', 'editor']);
    }

    const project = await Project.findById(targetProjectId);
    if (!project) {
      throw new ApiError(404, 'Project not found');
    }

    if (folderId) {
      const folder = await Folder.findById(folderId);
      if (!folder) {
        throw new ApiError(404, 'Folder not found');
      }
      if (folder.projectId !== targetProjectId) {
        throw new ApiError(400, 'folder_id does not belong to project_id');
      }
    }

    const extension = document.filePath.includes('.') ? document.filePath.split('.').pop() : '';
    const newStoragePath = `${targetProjectId}/${folderId || 'root'}/${document.id}${extension ? `.${extension}` : ''}`;

    // copy + remove to simulate move in Supabase storage
    if (document.filePath !== newStoragePath) {
      const { error: copyError } = await supabase
        .storage
        .from(SUPABASE_STORAGE_BUCKET)
        .copy(document.filePath, newStoragePath);

      if (copyError) {
        throw new Error(`Failed to move file: ${copyError.message}`);
      }

      await supabase
        .storage
        .from(SUPABASE_STORAGE_BUCKET)
        .remove([document.filePath]);
    }

    await Document.move(documentId, {
      projectId: targetProjectId,
      folderId: folderId || null,
    });

    return Document.update(documentId, { file_path: newStoragePath });
  }

  /**
   * Delete a document and its file from storage
   * @param {string} documentId
   * @returns {Promise<boolean>} Success status
   */
  async deleteDocument(documentId, user, options = {}) {
    const document = await Document.findById(documentId);
    if (!document) {
      throw new Error('Document not found');
    }
    if (!options.skipAccessCheck) {
      await MembershipService.requireProjectRole(user.id, document.projectId, ['owner', 'admin', 'editor']);
    }

    // Delete file from Supabase Storage
    try {
      await supabase
        .storage
        .from(SUPABASE_STORAGE_BUCKET)
        .remove([document.filePath]);
    } catch (error) {
      console.warn('[DocumentService] File not found in storage:', document.filePath);
    }

    await Document.delete(documentId);
    
    // Auto-clear project-scoped session state if this document was part of saved selection.
    await SessionState.removeDocIds([documentId], { projectId: document.projectId });
    
    return true;
  }
}

module.exports = new DocumentService();
