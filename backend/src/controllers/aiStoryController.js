/**
 * AI Story Controller
 * Handles AI-powered story generation, refinement, and estimation
 */

const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');
const { validationResult } = require('express-validator');
const aiService = require('../services/aiService');

const dbPath = process.env.DB_PATH || path.join(__dirname, '../../database.db');
const db = new Database(dbPath);
db.pragma('foreign_keys = ON');

function decryptApiKey(encryptedKey) {
  try {
    const secretKey = (process.env.ENCRYPTION_KEY || 'your-secret-key-change-in-production-32-chars!!').slice(0, 32).padEnd(32, '0');
    const [ivHex, cipherHex] = encryptedKey.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const encryptedText = Buffer.from(cipherHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(secretKey), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (error) {
    console.error('API key decryption failed:', error.message);
    return null;
  }
}

function parseJsonField(value, fallback = []) {
  try {
    if (!value) return fallback;
    if (Array.isArray(value)) return value;
    return JSON.parse(value);
  } catch (e) {
    return fallback;
  }
}

function getUserConfig(userId) {
  const stmt = db.prepare('SELECT * FROM ai_configurations WHERE user_id = ?');
  return stmt.get(String(userId));
}

function getStoryForUser(storyId, userId) {
  const stmt = db.prepare('SELECT * FROM user_stories WHERE id = ? AND user_id = ?');
  return stmt.get(storyId, userId);
}

function getStoriesForUser(userId) {
  const stmt = db.prepare('SELECT * FROM user_stories WHERE user_id = ? ORDER BY created_at DESC');
  return stmt.all(userId).map(formatStoryRow);
}

function formatStoryRow(row) {
  return {
    ...row,
    acceptance_criteria: parseJsonField(row.acceptance_criteria),
    tags: parseJsonField(row.tags, []),
  };
}

exports.generateStories = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const userId = req.user.id;
    const { requirementsText, storyCount = 5, complexity = 'standard', language, templateId } = req.body;

    console.log('[AI_STORY_DEBUG] userId:', userId, 'type:', typeof userId);
    const config = getUserConfig(userId);
    const envApiKey = process.env.OPENAI_API_KEY;
    let effectiveKey = null;

    if (config && config.api_key) {
      effectiveKey = decryptApiKey(config.api_key);
      if (!effectiveKey) {
        return res.status(500).json({ success: false, error: 'Failed to decrypt your AI API key' });
      }
    } else if (envApiKey) {
      effectiveKey = envApiKey;
    }

    if (!effectiveKey) {
      return res.status(400).json({
        success: false,
        error: 'AI configuration not set. Please add your API key in AI Settings or contact the administrator.'
      });
    }

    if (!aiService.initializeOpenAI(effectiveKey)) {
      return res.status(500).json({ success: false, error: 'Failed to initialize AI service' });
    }

    const options = {
      storyCount: Math.min(Math.max(storyCount, 1), 15),
      complexity,
      language: language || config.language || 'en',
      maxTokens: config.max_tokens || 3000,
      temperature: config.temperature || 0.7,
    };

    const generatedStories = await aiService.generateStoriesFromRequirements(requirementsText, options);

    // Persist generated stories
    const insert = db.prepare(`
      INSERT INTO user_stories (
        user_id, title, description, acceptance_criteria, priority, status, tags,
        estimated_points, business_value, azure_devops_id, created_at, updated_at, generated_by_ai
      ) VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1)
    `);

    const transaction = db.transaction((stories) => {
      return stories.map((story) => {
        const acceptance = JSON.stringify(story.acceptance_criteria || []);
        const tags = JSON.stringify([]);
        const result = insert.run(
          userId,
          story.title,
          story.description,
          acceptance,
          story.priority || 'P2',
          tags,
          story.estimated_points || story.estimate || null,
          story.business_value || null
        );

        const row = getStoryForUser(result.lastInsertRowid, userId);
        return { ...formatStoryRow(row), template_id: templateId || null };
      });
    });

    const savedStories = transaction(generatedStories);

    return res.status(201).json({
      success: true,
      message: 'Stories generated successfully',
      data: savedStories,
    });
  } catch (error) {
    console.error('Error generating stories:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to generate stories', details: error.message });
  }
};

exports.refineStory = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const userId = req.user.id;
    const { id } = req.params;
    const { feedback } = req.body;

    const story = getStoryForUser(id, userId);
    if (!story) {
      return res.status(404).json({ success: false, error: 'Story not found' });
    }

    const config = getUserConfig(userId);
    if (!config || !config.api_key) {
      return res.status(400).json({ success: false, error: 'AI configuration not set. Please add your API key first.' });
    }

    const apiKey = decryptApiKey(config.api_key);
    if (!apiKey) {
      return res.status(500).json({ success: false, error: 'Failed to decrypt API key' });
    }

    if (!aiService.initializeOpenAI(apiKey)) {
      return res.status(500).json({ success: false, error: 'Failed to initialize AI service' });
    }

    const refined = await aiService.refineStory(
      {
        title: story.title,
        description: story.description,
        acceptance_criteria: parseJsonField(story.acceptance_criteria),
        estimated_points: story.estimated_points,
        priority: story.priority,
        business_value: story.business_value,
      },
      feedback
    );

    const update = db.prepare(`
      UPDATE user_stories
      SET title = ?, description = ?, acceptance_criteria = ?,
          estimated_points = ?, priority = ?, business_value = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `);

    update.run(
      refined.title,
      refined.description,
      JSON.stringify(refined.acceptance_criteria || []),
      refined.estimated_points || refined.estimate || story.estimated_points || null,
      refined.priority || story.priority,
      refined.business_value || story.business_value,
      id,
      userId
    );

    const updated = getStoryForUser(id, userId);

    return res.json({
      success: true,
      message: 'Story refined successfully',
      data: formatStoryRow(updated),
    });
  } catch (error) {
    console.error('Error refining story:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to refine story', details: error.message });
  }
};

exports.estimateStoryPoints = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const userId = req.user.id;
    const { story_ids = [] } = req.body;

    const config = getUserConfig(userId);
    if (!config || !config.api_key) {
      return res.status(400).json({ success: false, error: 'AI configuration not set. Please add your API key first.' });
    }

    const apiKey = decryptApiKey(config.api_key);
    if (!apiKey) {
      return res.status(500).json({ success: false, error: 'Failed to decrypt API key' });
    }

    if (!aiService.initializeOpenAI(apiKey)) {
      return res.status(500).json({ success: false, error: 'Failed to initialize AI service' });
    }

    const stmt = db.prepare('SELECT * FROM user_stories WHERE id = ? AND user_id = ?');
    const update = db.prepare('UPDATE user_stories SET estimated_points = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?');

    const results = {};

    for (const storyId of story_ids) {
      const story = stmt.get(storyId, userId);
      if (!story) {
        results[storyId] = null;
        continue;
      }

      const estimation = await aiService.estimateStoryPoints({
        title: story.title,
        description: story.description,
        acceptance_criteria: parseJsonField(story.acceptance_criteria),
      });

      update.run(estimation, storyId, userId);
      results[storyId] = estimation;
    }

    return res.json({
      success: true,
      message: 'Estimations updated',
      data: results,
    });
  } catch (error) {
    console.error('Error estimating story points:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to estimate story points', details: error.message });
  }
};

exports.getTemplates = (req, res) => {
  try {
    const templates = db.prepare('SELECT * FROM story_templates ORDER BY is_default DESC, name ASC').all();
    const formatted = templates.map((tpl) => ({
      ...tpl,
      template_content: parseJsonField(tpl.template_content, {}),
      fields_definition: parseJsonField(tpl.fields_definition, {}),
    }));

    return res.json({ success: true, data: formatted });
  } catch (error) {
    console.error('Error fetching templates:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch templates' });
  }
};

// Manual CRUD to keep AI and hand-written stories in one place (SQLite user_stories)
exports.listStories = (req, res) => {
  try {
    const userId = req.user.id;
    const rows = getStoriesForUser(userId);
    return res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error listing stories:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch stories' });
  }
};

exports.createManualStory = (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const userId = req.user.id;
    const {
      title,
      description = '',
      acceptanceCriteria = [],
      priority = 'P2',
      status = 'draft',
      estimated_points = null,
      business_value = null,
      tags = [],
      group_id = null,
    } = req.body;

    const insert = db.prepare(`
      INSERT INTO user_stories (
        user_id, title, description, acceptance_criteria, priority, status, tags,
        estimated_points, business_value, azure_devops_id, created_at, updated_at, generated_by_ai
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0)
    `);

    const acceptance = JSON.stringify(Array.isArray(acceptanceCriteria) ? acceptanceCriteria : [acceptanceCriteria].filter(Boolean));
    const tagJson = JSON.stringify(Array.isArray(tags) ? tags : []);

    const result = insert.run(
      userId,
      title,
      description,
      acceptance,
      priority,
      status,
      tagJson,
      estimated_points,
      business_value
    );

    if (group_id) {
      db.prepare('UPDATE user_stories SET group_id = ? WHERE id = ?').run(group_id, result.lastInsertRowid);
    }

    const row = getStoryForUser(result.lastInsertRowid, userId);
    return res.status(201).json({ success: true, data: formatStoryRow(row) });
  } catch (error) {
    console.error('Error creating story:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to create story' });
  }
};

exports.updateStory = (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const userId = req.user.id;
    const { id } = req.params;
    const {
      title,
      description,
      acceptanceCriteria,
      priority,
      status,
      estimated_points,
      business_value,
      tags,
      group_id,
    } = req.body;

    const story = getStoryForUser(id, userId);
    if (!story) {
      return res.status(404).json({ success: false, error: 'Story not found' });
    }



    const update = db.prepare(`
      UPDATE user_stories
      SET title = COALESCE(?, title),
          description = COALESCE(?, description),
          acceptance_criteria = COALESCE(?, acceptance_criteria),
          priority = COALESCE(?, priority),
          status = COALESCE(?, status),
          estimated_points = COALESCE(?, estimated_points),
          business_value = COALESCE(?, business_value),
          tags = COALESCE(?, tags),
          group_id = COALESCE(?, group_id),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `);

    const acceptance = acceptanceCriteria === undefined
      ? undefined
      : JSON.stringify(Array.isArray(acceptanceCriteria) ? acceptanceCriteria : [acceptanceCriteria].filter(Boolean));
    const tagJson = tags === undefined ? undefined : JSON.stringify(Array.isArray(tags) ? tags : []);

    update.run(
      title ?? null,
      description ?? null,
      acceptance ?? null,
      priority ?? null,
      status ?? null,
      estimated_points ?? null,
      business_value ?? null,
      tagJson ?? null,
      group_id ?? null,
      id,
      userId
    );

    const row = getStoryForUser(id, userId);
    return res.json({ success: true, data: formatStoryRow(row) });
  } catch (error) {
    console.error('Error updating story:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to update story' });
  }
};

exports.deleteStory = (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const del = db.prepare('DELETE FROM user_stories WHERE id = ? AND user_id = ?');
    const result = del.run(id, userId);
    if (result.changes === 0) {
      return res.status(404).json({ success: false, error: 'Story not found' });
    }
    return res.json({ success: true, message: 'Story deleted' });
  } catch (error) {
    console.error('Error deleting story:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to delete story' });
  }
};
