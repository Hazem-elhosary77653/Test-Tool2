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
 * POST /api/chat/project/:projectId
 */
exports.chatWithProject = async (req, res) => {
    try {
        const userId = req.user.id;
        const { projectId } = req.params;
        const { message, currentPath, history = [] } = req.body;

        if (!message) {
            return res.status(400).json({ success: false, error: 'Message is required' });
        }

        // 1. Fetch Project Details
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

        // 2. Fetch Workspace Statistics & Recent Activity
        let statsContext = "";
        try {
            // Weekly logins
            const weeklyLogins = db.prepare(`
                SELECT COUNT(*) as count
                FROM activity_logs
                WHERE action_type IN ('LOGIN', 'LOGIN_SUCCESS')
                AND created_at >= date('now', '-7 days')
            `).get()?.count || 0;

            // Top active users
            const topUsers = db.prepare(`
                SELECT u.username, COUNT(*) as count
                FROM activity_logs al
                JOIN users u ON al.user_id = u.id
                WHERE al.action_type IN ('LOGIN', 'LOGIN_SUCCESS')
                GROUP BY u.username
                ORDER BY count DESC
                LIMIT 5
            `).all();

            // Recent system activities
            const recentActivities = db.prepare(`
                SELECT u.username, al.action_type, al.description, al.created_at
                FROM activity_logs al
                JOIN users u ON al.user_id = u.id
                ORDER BY al.created_at DESC
                LIMIT 10
            `).all();

            statsContext = "\nWORKSPACE STATISTICS & RECENT ACTIVITY:\n";
            statsContext += `- Total Logins (Last 7 Days): ${weeklyLogins}\n`;
            if (topUsers.length > 0) {
                statsContext += "- Most Active Users (Logins):\n";
                topUsers.forEach(u => statsContext += `  * ${u.username}: ${u.count} times\n`);
            }
            if (recentActivities.length > 0) {
                statsContext += "- Recent System Events:\n";
                recentActivities.forEach(a => statsContext += `  * [${a.created_at}] ${a.username}: ${a.action_type} - ${a.description}\n`);
            }
            statsContext += "\n";

            // 3. SECURE: Fetch User-Role mapping and Permission Matrix
            // We only fetch non-sensitive data (email, role) and the general permission matrix
            const userRoles = db.prepare('SELECT email, role FROM users WHERE is_active = 1').all();
            const permissionsMatrix = db.prepare('SELECT role, action, resource FROM permissions').all();

            statsContext += "USER ROLES & SYSTEM PERMISSIONS:\n";
            statsContext += "- Registered Users and their roles:\n";
            userRoles.forEach(u => statsContext += `  * ${u.email}: ${u.role}\n`);

            statsContext += "\n- Permission Matrix (Who can do what):\n";
            // Group permissions by role for more efficient context
            const rolePermissions = {};
            permissionsMatrix.forEach(p => {
                if (!rolePermissions[p.role]) rolePermissions[p.role] = [];
                rolePermissions[p.role].push(`${p.action} on ${p.resource}`);
            });

            Object.entries(rolePermissions).forEach(([role, perms]) => {
                statsContext += `  * Role [${role}] can: ${perms.join(', ')}\n`;
            });
            statsContext += "\n";

        } catch (e) {
            console.error("Failed to fetch statistics or permissions for AI context:", e);
        }

        // 4. Initialize AI

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

        // 5. Build Contextual Prompt

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
            stories.slice(0, 20).forEach((s, i) => { // Limit to 20 stories for context window

                contextText += `${i + 1}. ${s.title}\n   - Description: ${s.description}\n   - AC: ${s.acceptance_criteria}\n\n`;
            });
        }

        if (brds.length > 0) {
            contextText += project ? "BRD DOCUMENTS IN THIS PROJECT:\n" : "ALL BRD DOCUMENTS IN WORKSPACE:\n";
            brds.slice(0, 5).forEach((b, i) => { // Limit to 5 BRDs for context window

                contextText += `Document ${i + 1}: ${b.title}\nContent Snippet: ${b.content.substring(0, 1500)}\n\n`;
            });
        }

        // Add Statistics (especially useful in Global Mode)
        if (statsContext) {
            contextText += statsContext;
        }

        const systemPrompt = project
            ? `${contextText}\nAnswer user questions based on the project context provided above. Be professional, concise, and helpful.`
            : `${contextText}\nYou have access to multiple projects, documents, and system activity statistics. Help the user summarize, compare, or find information across their workspace. You can answer questions about system usage, login frequency, and active users based on the statistics provided above.`;


        const messages = [
            {
                role: 'system',
                content: systemPrompt
            },
            ...history.map(h => ({ role: h.role, content: h.content })),
            { role: 'user', content: message }
        ];

        // 6. Call OpenAI via aiService (or directly if needed, but let's use the service pattern)
        // aiService doesn't have a direct "chat" but we can use completion
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
