const pool = require('../db/connection');
const crypto = require('crypto');
const aiService = require('../services/aiService');
const { logAuditAction } = require('../utils/audit');

/**
 * Helper to get decrypted API key for a user
 */
const getEffectiveApiKey = async (userIdStr) => {
    const configResult = await pool.query('SELECT * FROM ai_configurations WHERE user_id = $1', [userIdStr]);
    const config = configResult.rows[0];
    const envApiKey = process.env.OPENAI_API_KEY;

    if (config && config.api_key) {
        try {
            const algorithm = 'aes-256-cbc';
            const secretKey = (process.env.ENCRYPTION_KEY || 'your-secret-key-change-in-production-32-chars!!')
                .slice(0, 32)
                .padEnd(32, '0');
            const parts = config.api_key.split(':');
            const iv = Buffer.from(parts[0], 'hex');
            const encrypted = Buffer.from(parts[1], 'hex');

            const decipher = crypto.createDecipheriv(algorithm, Buffer.from(secretKey), iv);
            let decrypted = decipher.update(encrypted);
            decrypted = Buffer.concat([decrypted, decipher.final()]);
            return decrypted.toString();
        } catch (e) {
            console.error('Failed to decrypt API key:', e.message);
            return null;
        }
    }
    return envApiKey || null;
};

/**
 * Generate a diagram using AI
 * POST /api/diagrams/generate
 */
exports.generateDiagram = async (req, res) => {
    try {
        const userId = req.user.id;
        const userIdStr = String(userId);
        const { brdId, prompt, type = 'flowchart' } = req.body;

        let context = prompt;

        // If brdId is provided, fetch BRD content as context
        if (brdId) {
            const userIdInt = Number(userId);
            const result = await pool.query(
                `SELECT b.title, b.content 
                 FROM brd_documents b
                 LEFT JOIN brd_collaborators c ON c.brd_id = b.id AND c.user_id = $2
                 WHERE b.id = $1 AND (b.user_id = $2 OR b.assigned_to = $3 OR c.user_id IS NOT NULL)`,
                [brdId, userIdStr, userIdInt]
            );
            const brd = result.rows[0];
            if (brd) {
                context = `Project Title: ${brd.title}\n\nContent:\n${brd.content}\n\nUser Request: ${prompt || 'Generate a flowchart for this project.'}`;
            }
        }

        if (!context) {
            return res.status(400).json({ success: false, error: 'Context or BRD ID is required' });
        }

        const effectiveKey = await getEffectiveApiKey(userIdStr);

        if (!effectiveKey) {
            return res.status(400).json({
                success: false,
                error: 'AI configuration not set. Please configure OpenAI API key first in AI Settings.',
            });
        }

        if (!aiService.initializeOpenAI(effectiveKey)) {
            return res.status(500).json({ success: false, error: 'Failed to initialize AI service' });
        }

        const diagramData = await aiService.generateDiagram(context, type);

        res.json({
            success: true,
            data: diagramData
        });

    } catch (error) {
        console.error('Generate Diagram Error:', error);
        res.status(500).json({ success: false, error: 'Failed to generate diagram', details: error.message });
    }
};

/**
 * Extract user stories from a diagram
 * POST /api/diagrams/:id/extract-stories
 */
exports.extractStories = async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;

        const diagResult = await pool.query(
            'SELECT * FROM diagrams WHERE id = $1 AND user_id = $2',
            [id, userId]
        );
        const diagram = diagResult.rows[0];

        if (!diagram) {
            return res.status(404).json({ success: false, error: 'Diagram not found' });
        }

        const effectiveKey = await getEffectiveApiKey(String(userId));
        if (!effectiveKey) {
            return res.status(400).json({ success: false, error: 'AI key not configured' });
        }

        if (!aiService.initializeOpenAI(effectiveKey)) {
            return res.status(500).json({ success: false, error: 'Failed to initialize AI service' });
        }

        const stories = await aiService.extractStoriesFromDiagram(diagram.diagram_data);

        res.json({
            success: true,
            data: stories
        });
    } catch (error) {
        console.error('Extract Stories Error:', error);
        res.status(500).json({ success: false, error: 'Failed to extract stories', details: error.message });
    }
};

/**
 * Save extracted stories from a diagram
 * POST /api/diagrams/:id/save-stories
 */
exports.saveStories = async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;
        const { stories } = req.body;

        if (!stories || !Array.isArray(stories)) {
            return res.status(400).json({ success: false, error: 'Stories are required' });
        }

        const diagResult = await pool.query(
            'SELECT * FROM diagrams WHERE id = $1 AND user_id = $2',
            [id, userId]
        );
        const diagram = diagResult.rows[0];

        if (!diagram) {
            return res.status(404).json({ success: false, error: 'Diagram not found' });
        }

        // Try to find a linked BRD to get the project context (group_id)
        const brdLinkResult = await pool.query('SELECT brd_id FROM brd_diagrams WHERE diagram_id = $1 LIMIT 1', [id]);
        let groupId = null;
        if (brdLinkResult.rows.length > 0) {
            const brdResult = await pool.query('SELECT group_id FROM brd_documents WHERE id = $1', [brdLinkResult.rows[0].brd_id]);
            if (brdResult.rows.length > 0) {
                groupId = brdResult.rows[0].group_id;
            }
        }

        // Insert stories using the pattern from aiStoryController
        console.log(`[DIAGRAM_SAVE] Saving ${stories.length} stories for diagram ${id}, userId: ${userId}, groupId: ${groupId}`);

        for (const story of stories) {
            const storyParams = [
                userId,
                story.title,
                story.description,
                JSON.stringify(story.acceptance_criteria || []),
                story.priority || 'P2',
                story.estimated_points || null,
                groupId,
                JSON.stringify(['extracted-from-diagram'])
            ];

            console.log('[DIAGRAM_SAVE] Inserting story:', story.title);

            try {
                await pool.query(
                    `INSERT INTO user_stories (
                        user_id, title, description, acceptance_criteria, priority, status, 
                        estimated_points, generated_by_ai, group_id, tags, created_at, updated_at
                    ) VALUES ($1, $2, $3, $4, $5, 'draft', $6, 1, $7, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
                    storyParams
                );
            } catch (storyErr) {
                console.error('[DIAGRAM_SAVE] Story Insert Failed:', storyErr.message);
                throw storyErr;
            }
        }

        res.json({ success: true, message: `${stories.length} stories saved successfully` });

    } catch (error) {
        console.error('Save Stories Error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to save stories',
            details: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};

/**
 * Save a diagram
 * POST /api/diagrams
 */
exports.saveDiagram = async (req, res) => {
    try {
        const userId = req.user.id;
        const { title, description, mermaidCode, type, brdId } = req.body;

        // Note: Using pool.query which handled RETURNING in our SQLite wrapper
        const result = await pool.query(`
            INSERT INTO diagrams (user_id, title, description, diagram_type, diagram_data, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            RETURNING id
        `, [userId, title, description, type, mermaidCode]);

        const id = result.rows[0]?.id;

        // Log audit action
        try {
            await logAuditAction(userId, 'DIAGRAM_CREATED', 'diagram', id);
        } catch (auditErr) {
            console.error('Audit logging failed for diagram creation:', auditErr.message);
        }

        // If brdId is provided, link it
        if (brdId) {
            try {
                await pool.query('INSERT INTO brd_diagrams (brd_id, diagram_id) VALUES ($1, $2)', [brdId, id]);
            } catch (linkErr) {
                console.log('BRD linking skipped:', linkErr.message);
            }
        }

        res.json({
            success: true,
            data: { id, title, description, mermaid_code: mermaidCode, diagram_type: type }
        });

    } catch (error) {
        console.error('Save Diagram Error:', error);
        res.status(500).json({ success: false, error: 'Failed to save diagram', details: error.message });
    }
};

/**
 * Get all diagrams for a user
 * GET /api/diagrams
 */
exports.getDiagrams = async (req, res) => {
    try {
        const userId = req.user.id;
        const { type, search } = req.query;

        // Casing normalization: some frontends send 'All', others 'all'
        const normalizedType = type ? type.toLowerCase() : 'all';

        let sql = `
            SELECT id, user_id, title, description, diagram_type, diagram_data as mermaid_code, created_at, updated_at 
            FROM diagrams 
            WHERE user_id = $1
        `;
        const params = [userId];

        if (normalizedType !== 'all') {
            sql += ` AND diagram_type = $${params.length + 1}`;
            params.push(normalizedType);
        }

        if (search) {
            sql += ` AND (title LIKE $${params.length + 1} OR description LIKE $${params.length + 1})`;
            params.push(`%${search}%`, `%${search}%`);
        }

        sql += ` ORDER BY created_at DESC`;

        const result = await pool.query(sql, params);

        res.json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        console.error('Get Diagrams Error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch diagrams' });
    }
};

/**
 * Get diagram by ID
 * GET /api/diagrams/:id
 */
exports.getDiagramById = async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;

        const result = await pool.query(`
            SELECT id, user_id, title, description, diagram_type, diagram_data as mermaid_code, created_at, updated_at 
            FROM diagrams 
            WHERE id = $1 AND user_id = $2
        `, [id, userId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Diagram not found' });
        }

        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        console.error('Get Diagram Error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch diagram' });
    }
};

/**
 * Get linked diagrams for a BRD
 * GET /api/diagrams/brd/:brdId
 */
exports.getBrdDiagrams = async (req, res) => {
    try {
        const userId = req.user.id;
        const userIdStr = String(userId);
        const userIdInt = Number(userId);
        const { brdId } = req.params;

        const result = await pool.query(`
            SELECT d.id, d.user_id, d.title, d.description, d.diagram_type, d.diagram_data as mermaid_code, d.created_at 
            FROM diagrams d
            JOIN brd_diagrams bd ON d.id = bd.diagram_id
            JOIN brd_documents b ON b.id = bd.brd_id
            LEFT JOIN brd_collaborators c ON c.brd_id = b.id AND c.user_id = $2
            WHERE bd.brd_id = $1 AND (b.user_id = $2 OR b.assigned_to = $3 OR c.user_id IS NOT NULL)
        `, [brdId, userIdStr, userIdInt]);

        res.json({ success: true, data: result.rows });
    } catch (error) {
        console.error('Get BRD Diagrams Error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch linked diagrams' });
    }
};

/**
 * Link an existing diagram to a BRD
 * POST /api/diagrams/link
 */
exports.linkToBrd = async (req, res) => {
    try {
        const { brdId, diagramId } = req.body;
        console.log(`[DIAGRAM_LINK] Attempting to link diagram ${diagramId} to BRD ${brdId}`);

        if (!brdId || !diagramId) {
            return res.status(400).json({ success: false, error: 'BRD ID and Diagram ID are required' });
        }

        // Check if already linked
        const existing = await pool.query(
            'SELECT id FROM brd_diagrams WHERE brd_id = $1 AND diagram_id = $2',
            [brdId, diagramId]
        );

        if (existing.rows.length > 0) {
            console.log('[DIAGRAM_LINK] Already linked');
            return res.json({ success: true, message: 'Diagram already linked to this BRD' });
        }

        await pool.query('INSERT INTO brd_diagrams (brd_id, diagram_id) VALUES ($1, $2)', [brdId, diagramId]);
        console.log('[DIAGRAM_LINK] Link successful');
        res.json({ success: true, message: 'Diagram linked to BRD successfully' });
    } catch (error) {
        console.error('Link Diagram Error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to link diagram',
            details: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};

/**
 * Delete a diagram
 * DELETE /api/diagrams/:id
 */
exports.deleteDiagram = async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;

        // Check if diagram exists and belongs to user
        const checkResult = await pool.query('SELECT id FROM diagrams WHERE id = $1 AND user_id = $2', [id, userId]);
        if (checkResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Diagram not found' });
        }

        // Delete links first
        await pool.query('DELETE FROM brd_diagrams WHERE diagram_id = $1', [id]);

        // Delete diagram
        await pool.query('DELETE FROM diagrams WHERE id = $1 AND user_id = $2', [id, userId]);

        // Log audit action
        try {
            await logAuditAction(userId, 'DIAGRAM_DELETED', 'diagram', id);
        } catch (auditErr) {
            console.error('Audit logging failed for diagram deletion:', auditErr.message);
        }

        res.json({ success: true, message: 'Diagram deleted successfully' });
    } catch (error) {
        console.error('Delete Diagram Error:', error);
        res.status(500).json({ success: false, error: 'Failed to delete diagram' });
    }
};
