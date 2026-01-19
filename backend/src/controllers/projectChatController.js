const Database = require('better-sqlite3');
const path = require('path');
const aiService = require('../services/aiService');
const crypto = require('crypto');

const dbPath = process.env.DB_PATH || path.join(__dirname, '../../database.db');
const db = new Database(dbPath);
db.pragma('foreign_keys = ON');

/**
 * Decrypt API key from database
 */
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

/**
 * Chat with Project Context
 * POST /api/ai/project/:projectId
 */
exports.chatWithProject = async (req, res) => {
    try {
        const userId = req.user.id;
        const { projectId } = req.params;
        const { message, currentPath, history = [] } = req.body;

        if (!message) {
            return res.status(400).json({ success: false, error: 'Message is required' });
        }

        // 1. Fetch Context Details
        let project = null;
        let stories = [];
        let brds = [];

        if (projectId && projectId !== 'all') {
            project = db.prepare('SELECT * FROM story_groups WHERE id = ? AND user_id = ?').get(projectId, userId);
            if (!project) {
                return res.status(404).json({ success: false, error: 'Project not found' });
            }
            // Fetch stories for this group
            stories = db.prepare('SELECT title, description, acceptance_criteria, priority FROM user_stories WHERE group_id = ? AND user_id = ?').all(projectId, userId);
            // Fetch BRDs for this group
            brds = db.prepare('SELECT title, content FROM brd_documents WHERE group_id = ? AND user_id = ?').all(projectId, userId);
        } else {
            // Global Mode: Fetch all user stories and BRDs
            stories = db.prepare('SELECT title, description, acceptance_criteria, priority FROM user_stories WHERE user_id = ?').all(userId);
            brds = db.prepare('SELECT title, content FROM brd_documents WHERE user_id = ?').all(userId);
        }

        // 2. Initialize AI
        const config = db.prepare('SELECT * FROM ai_configurations WHERE user_id = ?').get(String(userId));
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
                error: 'AI configuration not found. Please set your API key in AI Settings or contact the administrator.'
            });
        }

        if (!aiService.initializeOpenAI(effectiveKey)) {
            return res.status(500).json({ success: false, error: 'Failed to initialize AI service' });
        }

        // 3. Build Contextual Prompt
        let contextText = project
            ? `You are a project-specific AI Assistant for the project: "${project.name}".\n`
            : `You are a general Project Assistant for the user's entire workspace.\n`;

        if (currentPath) {
            contextText += `The user is currently on the following page: ${currentPath}\n`;
        }

        if (project && project.description) {
            contextText += `Project Description: ${project.description}\n\n`;
        }

        if (stories.length > 0) {
            contextText += project ? "USER STORIES IN THIS PROJECT:\n" : "ALL USER STORIES IN WORKSPACE:\n";
            stories.slice(0, 20).forEach((s, i) => {
                contextText += `${i + 1}. ${s.title}\n   - Description: ${s.description}\n   - AC: ${s.acceptance_criteria}\n\n`;
            });
        }

        if (brds.length > 0) {
            contextText += project ? "BRD DOCUMENTS IN THIS PROJECT:\n" : "ALL BRD DOCUMENTS IN WORKSPACE:\n";
            brds.slice(0, 5).forEach((b, i) => {
                contextText += `Document ${i + 1}: ${b.title}\nContent Snippet: ${b.content.substring(0, 1500)}\n\n`;
            });
        }

        const systemPrompt = project
            ? `${contextText}\nAnswer user questions based on the project context provided above. Be professional, concise, and helpful.`
            : `${contextText}\nYou have access to multiple projects and documents. Help the user summarize, compare, or find information across their workspace. If they ask about a specific project, try to find it in the provided context.`;

        const messages = [
            {
                role: 'system',
                content: systemPrompt
            },
            ...history.map(h => ({ role: h.role, content: h.content })),
            { role: 'user', content: message }
        ];

        // 4. Call OpenAI
        const completion = await aiService.openai.chat.completions.create({
            model: (config && config.model) || 'gpt-3.5-turbo',
            messages: messages,
            temperature: 0.7,
            max_tokens: 1000,
        });

        const aiMessage = completion.choices[0].message.content;

        res.json({
            success: true,
            message: aiMessage
        });

    } catch (error) {
        console.error('Project Chat Error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to process project chat',
            details: error.message
        });
    }
};
