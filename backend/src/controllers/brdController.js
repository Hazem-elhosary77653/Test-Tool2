/**
 * BRD Generation Controller
 * Handles BRD generation from user stories using AI
 */

const { validationResult } = require('express-validator');
const Database = require('better-sqlite3');
const pathLib = require('path');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const aiService = require('../services/aiService');
const notificationService = require('../services/notificationService');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const { Document, Paragraph, HeadingLevel, TextRun, TableOfContents, Packer, AlignmentType, UnderlineType } = require('docx');
const MarkdownIt = require('markdown-it');
const excel = require('excel4node');

const dbPath = process.env.DB_PATH || pathLib.join(__dirname, '../../database.db');
const db = new Database(dbPath);
db.pragma('foreign_keys = ON');

/**
 * Get all BRDs for current user
 * GET /api/brd
 */
exports.listBRDs = async (req, res) => {
  try {
    const userId = req.user.id;
    const userIdStr = String(userId);
    const userIdInt = Number(userId);
    const { skip = 0, limit = 20 } = req.query;

    // Include documents the user owns, is assigned to review, or is a collaborator on
    const stmt = db.prepare(`
      SELECT DISTINCT 
        b.id, b.user_id, b.title, b.content, b.version, b.status, b.assigned_to, b.created_at, b.updated_at,
        c.permission_level as collaborator_permission
      FROM brd_documents b
      LEFT JOIN brd_collaborators c ON c.brd_id = b.id AND c.user_id = ?
      WHERE b.user_id = ? OR b.assigned_to = ? OR c.user_id IS NOT NULL
      ORDER BY b.updated_at DESC
      LIMIT ? OFFSET ?
    `);

    let brds = stmt.all(userIdStr, userIdStr, userIdInt, parseInt(limit), parseInt(skip));

    // Add a helper field for the frontend to know the user's role on this specific BRD
    brds = brds.map(brd => {
      let permission = 'view';
      if (String(brd.user_id) === userIdStr) permission = 'owner';
      else if (brd.collaborator_permission) permission = brd.collaborator_permission;
      else if (Number(brd.assigned_to) === userIdInt) permission = 'reviewer';

      return { ...brd, user_permission: permission };
    });

    const countStmt = db.prepare(`
      SELECT COUNT(DISTINCT b.id) as count
      FROM brd_documents b
      LEFT JOIN brd_collaborators c ON c.brd_id = b.id AND c.user_id = ?
      WHERE b.user_id = ? OR b.assigned_to = ? OR c.user_id IS NOT NULL
    `);
    const { count } = countStmt.get(userIdStr, userIdStr, userIdInt);

    res.json({
      success: true,
      data: brds,
      pagination: {
        total: count,
        skip: parseInt(skip),
        limit: parseInt(limit),
      },
    });
  } catch (error) {
    console.error('Error listing BRDs:', error.message);
    res.status(500).json({ success: false, error: 'Failed to list BRDs' });
  }
};

/**
 * Get BRD by ID
 * GET /api/brd/:id
 */
exports.getBRD = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userIdStr = String(userId);
    const userIdInt = Number(userId);

    const stmt = db.prepare(`
      SELECT b.*, c.permission_level as collaborator_permission
      FROM brd_documents b
      LEFT JOIN brd_collaborators c ON c.brd_id = b.id AND c.user_id = ?
      WHERE b.id = ? AND (b.user_id = ? OR b.assigned_to = ? OR c.user_id IS NOT NULL)
    `);

    const brd = stmt.get(userIdStr, id, userIdStr, userIdInt);

    if (!brd) {
      return res.status(404).json({ success: false, error: 'BRD not found' });
    }

    // Add a helper field for the frontend
    let permission = 'view';
    if (String(brd.user_id) === userIdStr) permission = 'owner';
    else if (brd.collaborator_permission) permission = brd.collaborator_permission;
    else if (Number(brd.assigned_to) === userIdInt) permission = 'reviewer';

    brd.user_permission = permission;

    res.json({
      success: true,
      data: brd,
    });
  } catch (error) {
    console.error('Error fetching BRD:', error.message);
    res.status(500).json({ success: false, error: 'Failed to fetch BRD' });
  }
};

/**
 * Generate BRD from user stories
 * POST /api/brd/generate
 */
exports.generateBRD = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const userId = req.user.id;
    const userIdStr = String(userId);
    const {
      story_ids = [],
      title,
      template = 'full',
      target_audience,
      in_scope,
      out_of_scope,
      tone,
      selected_sections,
      external_links,
      stakeholders = [],
      group_id,
      options = {}
    } = req.body;

    if (!story_ids || story_ids.length === 0) {
      return res.status(400).json({ success: false, error: 'At least one story is required' });
    }

    // Fetch user's AI configuration (fallback to env key if user config not set)
    const configStmt = db.prepare('SELECT * FROM ai_configurations WHERE user_id = ?');
    const config = configStmt.get(userIdStr);

    const envApiKey = process.env.OPENAI_API_KEY;
    let effectiveKey = null;

    if (config && config.api_key) {
      // Decrypt stored API key
      try {
        const crypto = require('crypto');
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
        effectiveKey = decrypted.toString();
      } catch (e) {
        return res.status(500).json({ success: false, error: 'Failed to decrypt API key' });
      }
    } else if (envApiKey) {
      // Fallback to backend .env key when no user-level config exists
      effectiveKey = envApiKey;
    } else {
      return res.status(400).json({
        success: false,
        error: 'AI configuration not set. Please configure OpenAI API key first.',
      });
    }

    // Initialize OpenAI
    if (!aiService.initializeOpenAI(effectiveKey)) {
      return res.status(500).json({ success: false, error: 'Failed to initialize AI service' });
    }

    // Handle Custom Template if applicable
    let templateContent = null;
    if (template && template.length > 20) { // Simple check for UUID length
      try {
        const tplStmt = db.prepare('SELECT content FROM templates WHERE id = ? AND (user_id = ? OR is_public = 1)');
        const customTpl = tplStmt.get(template, userIdStr);
        if (customTpl) {
          templateContent = customTpl.content;
          console.log(`[BRD_GEN] Using custom template: ${template}`);
        }
      } catch (err) {
        console.error('Error fetching custom template:', err);
      }
    }

    // Fetch selected user stories
    const placeholders = story_ids.map(() => '?').join(',');
    const storiesStmt = db.prepare(`
      SELECT id, title, description, acceptance_criteria, priority, status 
      FROM user_stories 
      WHERE id IN (${placeholders}) AND user_id = ?
    `);

    const stories = storiesStmt.all(...story_ids, userIdStr).map((story) => {
      // Normalize acceptance_criteria to an array for AI prompt formatting
      let criteria = story.acceptance_criteria;
      if (Array.isArray(criteria)) {
        // already array, keep as-is
      } else if (typeof criteria === 'string' && criteria.trim().length > 0) {
        // Try JSON parse first; fall back to splitting by newline/semicolon/comma
        try {
          const parsed = JSON.parse(criteria);
          if (Array.isArray(parsed)) {
            criteria = parsed;
          } else if (typeof parsed === 'string') {
            criteria = parsed.split(/\r?\n|;|,/).map((s) => s.trim()).filter(Boolean);
          }
        } catch (_) {
          criteria = criteria.split(/\r?\n|;|,/).map((s) => s.trim()).filter(Boolean);
        }
      } else {
        criteria = [];
      }

      return {
        ...story,
        acceptance_criteria: criteria,
      };
    });

    if (stories.length === 0) {
      return res.status(404).json({ success: false, error: 'No matching stories found' });
    }

    // Generate BRD using AI
    const generationOptions = {
      template,
      templateContent,
      language: (config && config.language) || 'en',
      detailLevel: (config && config.detail_level) || 'standard',
      maxTokens: (config && config.max_tokens) || 4000,
      temperature: (config && config.temperature) || 0.7,
      targetAudience: target_audience,
      inScope: in_scope,
      outOfScope: out_of_scope,
      tone: tone,
      selectedSections: selected_sections,
      externalLinks: external_links,
      stakeholders: stakeholders
    };

    const brdContent = await aiService.generateBRDFromStories(stories, generationOptions);

    // Save BRD to database
    const brdId = uuidv4();
    const insertStmt = db.prepare(`
      INSERT INTO brd_documents 
      (id, user_id, title, content, version, group_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);

    insertStmt.run(brdId, userIdStr, title || `BRD - ${new Date().toLocaleDateString()}`, brdContent, 1, group_id || null);

    // Log the action
    const logStmt = db.prepare(`
      INSERT INTO audit_logs (user_id, action, entity_type, entity_id, created_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);
    logStmt.run(userIdStr, 'CREATE', 'brd_document', brdId);

    res.json({
      success: true,
      message: 'BRD generated successfully',
      data: {
        id: brdId,
        title: title || `BRD - ${new Date().toLocaleDateString()}`,
        content: brdContent,
        version: 1,
      },
    });
  } catch (error) {
    console.error('Error generating BRD:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to generate BRD',
      details: error.message,
    });
  }
};

/**
 * Update BRD content
 * PUT /api/brd/:id
 */
exports.updateBRD = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userIdStr = String(userId);
    const { content, title, group_id } = req.body;

    // Get current BRD and check if user is owner or collaborator with edit access
    const getStmt = db.prepare(`
      SELECT b.*, c.permission_level
      FROM brd_documents b
      LEFT JOIN brd_collaborators c ON c.brd_id = b.id AND c.user_id = ?
      WHERE b.id = ?
    `);
    const brd = getStmt.get(userIdStr, id);

    if (!brd) {
      return res.status(404).json({ success: false, error: 'BRD not found' });
    }

    const isOwner = String(brd.user_id) === userIdStr;
    const isEditor = brd.permission_level === 'edit' || brd.permission_level === 'admin';
    const isAdminRole = req.user.role === 'admin';

    if (!isOwner && !isEditor && !isAdminRole) {
      return res.status(403).json({ success: false, error: 'Unauthorized: You do not have permission to edit this BRD' });
    }

    // Check if approved
    if (brd.status === 'approved') {
      return res.status(400).json({ success: false, error: 'Approved BRDs cannot be modified' });
    }

    // Update BRD
    const updateStmt = db.prepare(`
      UPDATE brd_documents 
      SET content = ?, title = ?, group_id = COALESCE(?, group_id), version = version + 1, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `);

    updateStmt.run(content || brd.content, title || brd.title, group_id ?? null, id);

    // Save to version history
    const versionStmt = db.prepare(`
      INSERT INTO brd_versions (brd_id, content, version_number, created_at)
      SELECT id, content, version, CURRENT_TIMESTAMP FROM brd_documents WHERE id = ?
    `);
    versionStmt.run(id);

    // Log the action to audit_logs
    const logStmt = db.prepare(`
      INSERT INTO audit_logs (user_id, action, entity_type, entity_id, created_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);
    logStmt.run(userIdStr, 'UPDATE', 'brd_document', id);

    // Log the action to activity_logs for the UI
    const activityBtn = db.prepare(`
      INSERT INTO activity_logs (user_id, action_type, description, resource_type, resource_id, created_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);
    activityBtn.run(userIdStr, 'BRD_UPDATED', `Updated protocol: ${title || brd.title}`, 'brd_document', id);

    res.json({
      success: true,
      message: 'BRD updated successfully',
    });
  } catch (error) {
    console.error('Error updating BRD:', error.message);
    res.status(500).json({ success: false, error: 'Failed to update BRD' });
  }
};

/**
 * Delete BRD
 * DELETE /api/brd/:id
 */
exports.deleteBRD = async (req, res) => {
  try {
    const { id } = req.params;
    const userIdStr = String(req.user.id);

    // Check if BRD exists
    const checkStmt = db.prepare('SELECT id FROM brd_documents WHERE id = ? AND user_id = ?');
    if (!checkStmt.get(id, userIdStr)) {
      return res.status(404).json({ success: false, error: 'BRD not found' });
    }

    // Delete versions
    db.prepare('DELETE FROM brd_versions WHERE brd_id = ?').run(id);

    // Delete BRD
    db.prepare('DELETE FROM brd_documents WHERE id = ? AND user_id = ?').run(id, userIdStr);

    // Log the action
    const logStmt = db.prepare(`
      INSERT INTO audit_logs (user_id, action, entity_type, entity_id, created_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);
    logStmt.run(userIdStr, 'DELETE', 'brd_document', id);

    res.json({
      success: true,
      message: 'BRD deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting BRD:', error.message);
    res.status(500).json({ success: false, error: 'Failed to delete BRD' });
  }
};

/**
 * Get BRD version history
 * GET /api/brd/:id/versions
 */
exports.getVersionHistory = async (req, res) => {
  try {
    const { id } = req.params;
    const userIdStr = String(req.user.id);

    const userIdInt = Number(req.user.id);

    // Verify access (Owner, assigned reviewer, or collaborator)
    const accessStmt = db.prepare(`
      SELECT b.id 
      FROM brd_documents b
      LEFT JOIN brd_collaborators c ON c.brd_id = b.id AND c.user_id = ?
      WHERE b.id = ? AND (b.user_id = ? OR b.assigned_to = ? OR c.user_id IS NOT NULL)
    `);
    const brd = accessStmt.get(userIdStr, id, userIdStr, userIdInt);

    if (!brd) {
      return res.status(404).json({ success: false, error: 'BRD not found' });
    }

    const versionStmt = db.prepare(`
      SELECT version_number, created_at 
      FROM brd_versions 
      WHERE brd_id = ? 
      ORDER BY version_number DESC
    `);

    const versions = versionStmt.all(id);

    res.json({
      success: true,
      data: versions,
    });
  } catch (error) {
    console.error('Error fetching versions:', error.message);
    res.status(500).json({ success: false, error: 'Failed to fetch version history' });
  }
};

/**
 * Extract headings from markdown content
 */
function extractHeadings(content) {
  const lines = content.split(/\r?\n/);
  const headings = [];
  lines.forEach((line, index) => {
    const match = /^(#{1,6})\s+(.+)$/.exec(line);
    if (match) {
      const level = match[1].length;
      const text = match[2].trim();
      headings.push({ level, text, line: index });
    }
  });
  return headings;
}

/**
 * Export BRD to PDF with Table of Contents
 * POST /api/brd/:id/export-pdf
 */
exports.exportPDF = async (req, res) => {
  try {
    const { id } = req.params;
    const userIdStr = String(req.user.id);

    const stmt = db.prepare('SELECT * FROM brd_documents WHERE id = ? AND user_id = ?');
    const brd = stmt.get(id, userIdStr);

    if (!brd) {
      return res.status(404).json({ success: false, error: 'BRD not found' });
    }

    // Extract headings for ToC
    const headings = extractHeadings(brd.content);

    // Create PDF
    const doc = new PDFDocument({ bufferPages: true });
    const filename = `BRD_${brd.title.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.pdf`;
    const filepath = pathLib.join(__dirname, '../../uploads', filename);

    // Ensure uploads directory exists
    if (!fs.existsSync(pathLib.dirname(filepath))) {
      fs.mkdirSync(pathLib.dirname(filepath), { recursive: true });
    }

    const stream = fs.createWriteStream(filepath);
    doc.pipe(stream);

    // --- Professional Styles ---
    const primaryColor = '#4f46e5';
    const secondaryColor = '#64748b';
    const textColor = '#1e293b';

    // --- Cover Page ---
    doc.rect(0, 0, doc.page.width, 40).fill(primaryColor);
    doc.fillColor('#ffffff').fontSize(14).text('BUSINESS REQUIREMENTS DOCUMENT', 40, 14, { characterSpacing: 1 });

    doc.moveDown(4);
    doc.fillColor(textColor).fontSize(26).font('Helvetica-Bold').text(brd.title.toUpperCase(), { align: 'left' });
    doc.rect(40, doc.y + 5, 80, 2).fill(primaryColor);

    doc.moveDown(2);
    doc.fillColor(secondaryColor).fontSize(10).font('Helvetica').text('SYSTEM GENERATED | INTELLIGENCE STUDIO');
    doc.moveDown(0.5);
    doc.text(`VERSION: ${brd.version || 1}  |  DATE: ${new Date().toLocaleDateString()}`);

    // --- Table of Contents ---
    if (headings.length > 0) {
      doc.addPage();
      doc.fillColor(primaryColor).fontSize(20).font('Helvetica-Bold').text('TABLE OF CONTENTS', { underline: true });
      doc.moveDown(2);

      headings.forEach((heading, idx) => {
        const indent = (heading.level - 1) * 15;
        const dotLeader = '.'.repeat(Math.max(0, 60 - heading.text.length - indent / 2));

        doc.fillColor(textColor).fontSize(10).font('Helvetica');
        doc.text(`${' '.repeat(indent)}${idx + 1}. ${heading.text} ${dotLeader} ${idx + 2}`, {
          continued: false,
          lineGap: 3
        });
      });

      doc.addPage();
    }

    // --- Document Body with Styled Headings ---
    const lines = brd.content.split(/\r?\n/);
    lines.forEach(line => {
      const headingMatch = /^(#{1,6})\s+(.+)$/.exec(line);
      if (headingMatch) {
        const level = headingMatch[1].length;
        const text = headingMatch[2].trim();

        doc.moveDown(level === 1 ? 2 : 1);
        const fontSize = level === 1 ? 18 : level === 2 ? 16 : 14;
        doc.fillColor(primaryColor).fontSize(fontSize).font('Helvetica-Bold').text(text);
        doc.moveDown(0.5);
      } else if (line.trim()) {
        // Regular text
        doc.fillColor(textColor).fontSize(11).font('Helvetica').text(line, {
          align: 'justify',
          lineGap: 2
        });
      } else {
        doc.moveDown(0.5);
      }
    });

    // Add page numbers
    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i);
      doc.fillColor(secondaryColor).fontSize(9).text(
        `Page ${i + 1} of ${pages.count}`,
        doc.page.width - 100,
        doc.page.height - 30,
        { align: 'right' }
      );
    }

    doc.end();

    stream.on('finish', () => {
      res.download(filepath, filename, (err) => {
        if (err) console.error('Error downloading file:', err);
        fs.unlink(filepath, (err) => {
          if (err) console.error('Error cleaning up file:', err);
        });
      });
    });
  } catch (error) {
    console.error('Error exporting PDF:', error.message);
    res.status(500).json({ success: false, error: 'Failed to export PDF' });
  }
};

/**
 * Export BRD to DOCX with Table of Contents
 * POST /api/brd/:id/export-docx
 */
exports.exportDOCX = async (req, res) => {
  try {
    const { id } = req.params;
    const userIdStr = String(req.user.id);

    const stmt = db.prepare('SELECT * FROM brd_documents WHERE id = ? AND user_id = ?');
    const brd = stmt.get(id, userIdStr);

    if (!brd) {
      return res.status(404).json({ success: false, error: 'BRD not found' });
    }

    // Parse markdown content
    const lines = brd.content.split(/\r?\n/);
    const docSections = [];

    // Add title page
    docSections.push(
      new Paragraph({
        text: brd.title.toUpperCase(),
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 }
      }),
      new Paragraph({
        text: `Version ${brd.version || 1}`,
        alignment: AlignmentType.CENTER,
        spacing: { after: 100 }
      }),
      new Paragraph({
        text: `Generated: ${new Date().toLocaleDateString()}`,
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 }
      }),
      new Paragraph({
        text: 'BUSINESS REQUIREMENTS DOCUMENT',
        alignment: AlignmentType.CENTER,
        bold: true,
        spacing: { after: 200 }
      })
    );

    // Add Table of Contents
    docSections.push(
      new Paragraph({
        text: 'TABLE OF CONTENTS',
        heading: HeadingLevel.HEADING_1,
        pageBreakBefore: true
      }),
      new TableOfContents('Table of Contents', {
        hyperlink: true,
        headingStyleRange: '1-3'
      })
    );

    // Add page break before content
    docSections.push(
      new Paragraph({
        text: '',
        pageBreakBefore: true
      })
    );

    // Parse and add content
    lines.forEach(line => {
      const headingMatch = /^(#{1,6})\s+(.+)$/.exec(line);
      if (headingMatch) {
        const level = headingMatch[1].length;
        const text = headingMatch[2].trim();
        const headingLevel = level === 1 ? HeadingLevel.HEADING_1 :
          level === 2 ? HeadingLevel.HEADING_2 :
            level === 3 ? HeadingLevel.HEADING_3 :
              level === 4 ? HeadingLevel.HEADING_4 :
                level === 5 ? HeadingLevel.HEADING_5 : HeadingLevel.HEADING_6;

        docSections.push(
          new Paragraph({
            text: text,
            heading: headingLevel,
            spacing: { before: 240, after: 120 }
          })
        );
      } else if (line.trim()) {
        // Regular paragraph
        docSections.push(
          new Paragraph({
            text: line,
            spacing: { after: 120 }
          })
        );
      }
    });

    // Create document
    const docFile = new Document({
      sections: [{
        properties: {},
        children: docSections
      }]
    });

    // Generate buffer
    const buffer = await Packer.toBuffer(docFile);
    const filename = `BRD_${brd.title.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.docx`;
    const filepath = pathLib.join(__dirname, '../../uploads', filename);

    // Write to file
    fs.writeFileSync(filepath, buffer);

    // Send file
    res.download(filepath, filename, (err) => {
      if (err) console.error('Error downloading file:', err);
      fs.unlink(filepath, (err) => {
        if (err) console.error('Error cleaning up file:', err);
      });
    });
  } catch (error) {
    console.error('Error exporting DOCX:', error.message);
    res.status(500).json({ success: false, error: 'Failed to export DOCX' });
  }
};

/**
 * Export BRD to plain text
 * GET /api/brd/:id/export-text
 */
exports.exportText = async (req, res) => {
  try {
    const { id } = req.params;
    const userIdStr = String(req.user.id);

    const stmt = db.prepare('SELECT * FROM brd_documents WHERE id = ? AND user_id = ?');
    const brd = stmt.get(id, userIdStr);

    if (!brd) {
      return res.status(404).json({ success: false, error: 'BRD not found' });
    }

    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="BRD_${Date.now()}.txt"`);
    res.send(`${brd.title}\n\nGenerated: ${new Date().toLocaleString()}\n\n${brd.content}`);
  } catch (error) {
    console.error('Error exporting text:', error.message);
    res.status(500).json({ success: false, error: 'Failed to export text' });
  }
};

/**
 * Export BRD to Excel
 * POST /api/brd/:id/export-excel
 */
exports.exportExcel = async (req, res) => {
  try {
    const { id } = req.params;
    const userIdStr = String(req.user.id);

    const stmt = db.prepare('SELECT * FROM brd_documents WHERE id = ? AND user_id = ?');
    const brd = stmt.get(id, userIdStr);

    if (!brd) {
      return res.status(404).json({ success: false, error: 'BRD not found' });
    }

    const workbook = new excel.Workbook();
    const worksheet = workbook.addWorksheet('BRD Content');

    // Define styles
    const headerStyle = workbook.createStyle({
      font: { color: '#FFFFFF', bold: true, size: 12 },
      fill: { type: 'pattern', patternType: 'solid', fgColor: '#4F46E5' },
      alignment: { horizontal: 'center', vertical: 'center' }
    });

    const bodyStyle = workbook.createStyle({
      alignment: { wrapText: true, vertical: 'top' }
    });

    // Set headers
    worksheet.cell(1, 1).string('Section Title').style(headerStyle);
    worksheet.cell(1, 2).string('Content Description').style(headerStyle);

    // Set column widths
    worksheet.column(1).setWidth(30);
    worksheet.column(2).setWidth(80);

    // Parse content to extract sections
    const lines = brd.content.split(/\r?\n/);
    let currentRow = 2;
    let currentSection = 'Introduction';
    let currentContent = [];

    lines.forEach((line) => {
      const headingMatch = /^(#{1,6})\s+(.+)$/.exec(line);
      if (headingMatch) {
        // If we have a previous section, write it
        if (currentContent.length > 0 || currentSection !== 'Introduction') {
          worksheet.cell(currentRow, 1).string(currentSection).style(bodyStyle);
          worksheet.cell(currentRow, 2).string(currentContent.join('\n') || 'N/A').style(bodyStyle);
          currentRow++;
          currentContent = [];
        }
        currentSection = headingMatch[2].trim();
      } else if (line.trim()) {
        currentContent.push(line.trim());
      }
    });

    // Write the last section
    if (currentContent.length > 0 || currentSection !== 'Introduction') {
      worksheet.cell(currentRow, 1).string(currentSection).style(bodyStyle);
      worksheet.cell(currentRow, 2).string(currentContent.join('\n') || 'N/A').style(bodyStyle);
    }

    const filename = `BRD_${brd.title.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.xlsx`;
    const filepath = pathLib.join(__dirname, '../../uploads', filename);

    if (!fs.existsSync(pathLib.dirname(filepath))) {
      fs.mkdirSync(pathLib.dirname(filepath), { recursive: true });
    }

    workbook.write(filepath, (err, stats) => {
      if (err) {
        console.error('Excel write error:', err);
        return res.status(500).json({ success: false, error: 'Failed to generate Excel' });
      }
      res.download(filepath, filename, (downloadErr) => {
        if (downloadErr) console.error('Error downloading file:', downloadErr);
        fs.unlink(filepath, (unlinkErr) => {
          if (unlinkErr) console.error('Error cleaning up file:', unlinkErr);
        });
      });
    });
  } catch (error) {
    console.error('Error exporting Excel:', error.message);
    res.status(500).json({ success: false, error: 'Failed to export Excel' });
  }
};

/**
 * AI Analyze BRD
 * GET /api/brd/:id/analyze
 */
exports.analyzeBRD = async (req, res) => {
  try {
    const { id } = req.params;
    const userIdStr = String(req.user.id);

    console.log(`[analyzeBRD] Starting analysis for BRD ${id}, user ${userIdStr}`);

    // 1. Get BRD
    const brd = db.prepare('SELECT content FROM brd_documents WHERE id = ? AND user_id = ?').get(id, userIdStr);
    if (!brd) {
      console.log(`[analyzeBRD] BRD not found: ${id}`);
      return res.status(404).json({ success: false, error: 'BRD not found' });
    }

    console.log(`[analyzeBRD] BRD found, content length: ${brd.content?.length || 0}`);

    // 2. Check for existing analysis
    const existing = db.prepare('SELECT * FROM brd_analysis WHERE brd_id = ?').get(id);
    if (existing) {
      console.log(`[analyzeBRD] Returning cached analysis for BRD ${id}`);
      return res.json({
        success: true,
        data: {
          ...existing,
          strengths: JSON.parse(existing.strengths),
          gaps: JSON.parse(existing.gaps),
          suggestions: JSON.parse(existing.suggestions)
        }
      });
    }

    // 3. Get AI Config and Key
    console.log(`[analyzeBRD] Fetching AI config for user ${userIdStr}`);
    const config = db.prepare('SELECT * FROM ai_configurations WHERE user_id = ?').get(userIdStr);
    if (!config || !config.api_key) {
      console.log(`[analyzeBRD] AI configuration not set for user ${userIdStr}`);
      return res.status(400).json({ success: false, error: 'AI configuration not set. Please configure OpenAI API key in AI Config page.' });
    }

    console.log(`[analyzeBRD] AI config found, decrypting key...`);
    const { decryptKey } = require('../utils/encryption');
    const effectiveKey = decryptKey(config.api_key);

    console.log(`[analyzeBRD] Initializing OpenAI with key...`);
    if (!aiService.initializeOpenAI(effectiveKey)) {
      console.error(`[analyzeBRD] Failed to initialize OpenAI service`);
      return res.status(500).json({ success: false, error: 'AI service initialization failed' });
    }

    console.log(`[analyzeBRD] Calling AI service to analyze BRD...`);
    const analysis = await aiService.analyzeBRD(brd.content);
    console.log(`[analyzeBRD] Analysis completed successfully`);

    // 4. Save analysis for future
    try {
      db.prepare(`
        INSERT INTO brd_analysis (brd_id, score, risk_level, summary, strengths, gaps, suggestions)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        analysis.score,
        analysis.risk_level,
        analysis.summary,
        JSON.stringify(analysis.strengths),
        JSON.stringify(analysis.gaps),
        JSON.stringify(analysis.suggestions)
      );
      console.log(`[analyzeBRD] Analysis cached to database`);
    } catch (dbErr) {
      console.error('[analyzeBRD] Failed to cache analysis:', dbErr.message);
    }

    res.json({
      success: true,
      data: analysis
    });
  } catch (error) {
    console.error('[analyzeBRD] Error:', error.message);
    console.error('[analyzeBRD] Stack:', error.stack);
    res.status(500).json({ success: false, error: `Failed to analyze BRD: ${error.message}` });
  }
};

/**
 * Convert BRD into User Stories (Reverse Engineering)
 * POST /api/brd/:id/convert-to-stories
 */
exports.convertToStories = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { id } = req.params;
    const userIdStr = String(req.user.id);

    // 1. Get BRD
    const brd = db.prepare('SELECT content FROM brd_documents WHERE id = ? AND user_id = ?').get(id, userIdStr);
    if (!brd) return res.status(404).json({ success: false, error: 'BRD not found' });

    if (!brd.content || brd.content.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'BRD has no content to extract stories from' });
    }

    // 2. Setup AI
    const config = db.prepare('SELECT * FROM ai_configurations WHERE user_id = ?').get(userIdStr);
    if (!config || !config.api_key) {
      return res.status(400).json({
        success: false,
        error: 'AI configuration not found. Please configure your OpenAI API key in Settings.'
      });
    }

    const { decryptKey } = require('../utils/encryption');
    try {
      aiService.initializeOpenAI(decryptKey(config.api_key));
    } catch (decryptErr) {
      console.error('Error decrypting API key:', decryptErr);
      return res.status(500).json({ success: false, error: 'Failed to decrypt API key' });
    }

    // 3. Extract Stories
    const stories = await aiService.extractStoriesFromBRD(brd.content);

    if (!stories || stories.length === 0) {
      return res.json({
        success: true,
        message: 'No user stories could be extracted from this BRD',
        data: []
      });
    }

    // 4. Save to database (ai_stories table)
    const insertStmt = db.prepare(`
      INSERT INTO ai_stories (user_id, title, description, acceptance_criteria, priority, estimated_points, created_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    const savedStories = [];
    db.transaction(() => {
      for (const story of stories) {
        const result = insertStmt.run(
          userIdStr,
          story.title,
          story.description,
          JSON.stringify(story.acceptance_criteria || []),
          story.priority || 'P2',
          story.estimated_points || 0
        );
        savedStories.push({ ...story, id: result.lastInsertRowid });
      }
    })();

    res.json({
      success: true,
      message: `Successfully extracted ${savedStories.length} stories`,
      data: savedStories
    });
  } catch (error) {
    console.error('Error converting BRD to stories:', error.message);
    res.status(500).json({ success: false, error: 'Failed to extract stories' });
  }
};

/**
 * Get specific version content for comparison
 * GET /api/brd/:id/versions/:versionNumber
 */
exports.getVersionContent = async (req, res) => {
  try {
    const { id, versionNumber } = req.params;
    const userIdStr = String(req.user.id);

    const userIdInt = Number(req.user.id);

    const stmt = db.prepare(`
      SELECT v.content, b.title, v.version_number
      FROM brd_versions v
      JOIN brd_documents b ON v.brd_id = b.id
      LEFT JOIN brd_collaborators c ON c.brd_id = b.id AND c.user_id = ?
      WHERE v.brd_id = ? AND v.version_number = ? 
      AND (b.user_id = ? OR b.assigned_to = ? OR c.user_id IS NOT NULL)
    `);

    const version = stmt.get(userIdStr, id, versionNumber, userIdStr, userIdInt);
    if (!version) return res.status(404).json({ success: false, error: 'Version not found' });

    res.json({ success: true, data: version });
  } catch (error) {
    console.error('Error fetching version:', error.message);
    res.status(500).json({ success: false, error: 'Failed to fetch version content' });
  }
};

// ============ WORKFLOW ENDPOINTS ============

/**
 * Request review for a BRD (draft → in-review)
 */
exports.requestReview = async (req, res) => {
  try {
    const { id } = req.params;
    const { assigned_to, reason } = req.body;
    const userId = req.user.id;

    const userIdStr = String(userId);

    // Check if BRD exists and user has permission (Owner or Editor)
    const getStmt = db.prepare(`
      SELECT b.*, c.permission_level
      FROM brd_documents b
      LEFT JOIN brd_collaborators c ON c.brd_id = b.id AND c.user_id = ?
      WHERE b.id = ?
    `);
    const brd = getStmt.get(userIdStr, id);

    if (!brd) return res.status(404).json({ success: false, error: 'BRD not found' });

    const isOwner = String(brd.user_id) === userIdStr;
    const isEditor = brd.permission_level === 'edit' || brd.permission_level === 'admin';

    if (!isOwner && !isEditor) {
      return res.status(403).json({ success: false, error: 'Unauthorized: Only the owner or editors can request review' });
    }

    // Can only request review if status is 'draft'
    if (brd.status !== 'draft') {
      return res.status(400).json({ success: false, error: `Cannot request review for BRD with status "${brd.status}"` });
    }

    // Update BRD status
    const updateStmt = db.prepare(`
      UPDATE brd_documents 
      SET status = 'in-review', assigned_to = ?, request_review_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    updateStmt.run(assigned_to, id);

    // Record in workflow history
    const historyStmt = db.prepare(`
      INSERT INTO brd_workflow_history (brd_id, from_status, to_status, changed_by, reason)
      VALUES (?, ?, ?, ?, ?)
    `);
    historyStmt.run(id, 'draft', 'in-review', userId, reason || 'Requested for review');

    // Create review assignment
    const assignStmt = db.prepare(`
      INSERT OR REPLACE INTO brd_review_assignments (brd_id, assigned_to, assigned_by, status)
      VALUES (?, ?, ?, 'pending')
    `);
    assignStmt.run(id, assigned_to, userId);

    res.json({ success: true, message: 'Review requested successfully', data: { status: 'in-review' } });

    // Log to activity_logs
    try {
      db.prepare(`
        INSERT INTO activity_logs (user_id, action_type, description, resource_type, resource_id, created_at)
        VALUES (?, 'REVIEW_REQUESTED', ?, 'brd_document', ?, CURRENT_TIMESTAMP)
      `).run(userId, reason || 'Requested for review', id);
    } catch (e) { console.error('Activity log error:', e); }

    // Send notification to Assigned Reviewer
    try {
      await notificationService.notify(assigned_to, 'REVIEW_REQUESTED', {
        actor_id: userId,
        actor_name: req.user.name || req.user.username,
        brd_title: brd.title,
        resource_id: id,
        resource_type: 'brd_document'
      });
    } catch (nErr) { console.error('Notification error:', nErr.message); }
  } catch (error) {
    console.error('Error requesting review:', error.message);
    res.status(500).json({ success: false, error: 'Failed to request review' });
  }
};

/**
 * Approve a BRD (in-review → approved)
 */
exports.approveBRD = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const userId = req.user.id;

    // Check if BRD exists
    const brd = db.prepare(`SELECT * FROM brd_documents WHERE id = ?`).get(id);
    if (!brd) return res.status(404).json({ success: false, error: 'BRD not found' });

    // Only assigned reviewer can approve
    if (brd.assigned_to !== userId) {
      return res.status(403).json({ success: false, error: 'You are not authorized to approve this BRD' });
    }

    // Can only approve if status is 'in-review'
    if (brd.status !== 'in-review') {
      return res.status(400).json({ success: false, error: `Cannot approve BRD with status "${brd.status}"` });
    }

    // Update BRD status
    const updateStmt = db.prepare(`
      UPDATE brd_documents 
      SET status = 'approved', approved_by = ?, approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    updateStmt.run(userId, id);

    // Record in workflow history
    const historyStmt = db.prepare(`
      INSERT INTO brd_workflow_history (brd_id, from_status, to_status, changed_by, reason)
      VALUES (?, ?, ?, ?, ?)
    `);
    historyStmt.run(id, 'in-review', 'approved', userId, reason || 'Approved');

    // Update review assignment
    const assignStmt = db.prepare(`
      UPDATE brd_review_assignments 
      SET status = 'approved', reviewed_at = CURRENT_TIMESTAMP
      WHERE brd_id = ? AND assigned_to = ?
    `);
    assignStmt.run(id, userId);

    res.json({ success: true, message: 'BRD approved successfully', data: { status: 'approved' } });

    // Log to activity_logs
    try {
      db.prepare(`
        INSERT INTO activity_logs (user_id, action_type, description, resource_type, resource_id, created_at)
        VALUES (?, 'APPROVED', ?, 'brd_document', ?, CURRENT_TIMESTAMP)
      `).run(userId, reason || 'Protocol approved', id);
    } catch (e) { console.error('Activity log error:', e); }

    // Send notification to BRD Owner
    try {
      await notificationService.notify(brd.user_id, 'BRD_APPROVED', {
        actor_id: userId,
        actor_name: req.user.name || req.user.username,
        brd_title: brd.title,
        resource_id: id,
        resource_type: 'brd_document'
      });
    } catch (nErr) { console.error('Notification error:', nErr.message); }
  } catch (error) {
    console.error('Error approving BRD:', error.message);
    res.status(500).json({ success: false, error: 'Failed to approve BRD' });
  }
};

/**
 * Reject a BRD (in-review → draft with feedback)
 */
exports.rejectBRD = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const userId = req.user.id;

    // Check if BRD exists
    const brd = db.prepare(`SELECT * FROM brd_documents WHERE id = ?`).get(id);
    if (!brd) return res.status(404).json({ success: false, error: 'BRD not found' });

    // Only assigned reviewer can reject
    if (brd.assigned_to !== userId) {
      return res.status(403).json({ success: false, error: 'You are not authorized to reject this BRD' });
    }

    // Can only reject if status is 'in-review'
    if (brd.status !== 'in-review') {
      return res.status(400).json({ success: false, error: `Cannot reject BRD with status "${brd.status}"` });
    }

    // Update BRD status back to draft
    const updateStmt = db.prepare(`
      UPDATE brd_documents 
      SET status = 'draft', assigned_to = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    updateStmt.run(id);

    // Record in workflow history
    const historyStmt = db.prepare(`
      INSERT INTO brd_workflow_history (brd_id, from_status, to_status, changed_by, reason)
      VALUES (?, ?, ?, ?, ?)
    `);
    historyStmt.run(id, 'in-review', 'draft', userId, reason || 'Rejected for revisions');

    // Update review assignment
    const assignStmt = db.prepare(`
      UPDATE brd_review_assignments 
      SET status = 'rejected', reviewed_at = CURRENT_TIMESTAMP, comment = ?
      WHERE brd_id = ? AND assigned_to = ?
    `);
    assignStmt.run(reason || '', id, userId);

    res.json({ success: true, message: 'BRD rejected for revisions', data: { status: 'draft' } });

    // Log to activity_logs
    try {
      db.prepare(`
        INSERT INTO activity_logs (user_id, action_type, description, resource_type, resource_id, created_at)
        VALUES (?, 'REJECTED', ?, 'brd_document', ?, CURRENT_TIMESTAMP)
      `).run(userId, reason || 'Rejected for revisions', id);
    } catch (e) { console.error('Activity log error:', e); }

    // Send notification to BRD Owner
    try {
      await notificationService.notify(brd.user_id, 'BRD_REJECTED', {
        actor_id: userId,
        actor_name: req.user.name || req.user.username,
        brd_title: brd.title,
        resource_id: id,
        resource_type: 'brd_document'
      });
    } catch (nErr) { console.error('Notification error:', nErr.message); }
  } catch (error) {
    console.error('Error rejecting BRD:', error.message);
    res.status(500).json({ success: false, error: 'Failed to reject BRD' });
  }
};

/**
 * Get workflow history for a BRD
 */
exports.getWorkflowHistory = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Check if user has access to BRD (Owner, assigned reviewer, or collaborator)
    const userIdStr = String(userId);
    const userIdInt = Number(userId);
    const brd = db.prepare(`
      SELECT b.id 
      FROM brd_documents b
      LEFT JOIN brd_collaborators c ON c.brd_id = b.id AND c.user_id = ?
      WHERE b.id = ? AND (b.user_id = ? OR b.assigned_to = ? OR c.user_id IS NOT NULL)
    `).get(userIdStr, id, userIdStr, userIdInt);

    if (!brd) return res.status(404).json({ success: false, error: 'BRD not found' });

    const stmt = db.prepare(`
      SELECT 
        h.*,
        u.first_name,
        u.last_name,
        u.email
      FROM brd_workflow_history h
      LEFT JOIN users u ON h.changed_by = u.id
      WHERE h.brd_id = ?
      ORDER BY h.created_at DESC
    `);

    const history = stmt.all(id);
    res.json({ success: true, data: history });
  } catch (error) {
    console.error('Error fetching workflow history:', error.message);
    res.status(500).json({ success: false, error: 'Failed to fetch workflow history' });
  }
};

/**
 * Get review assignments for a BRD
 */
exports.getReviewAssignments = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Check if user has access to BRD
    const brd = db.prepare(`SELECT id FROM brd_documents WHERE id = ? AND user_id = ?`).get(id, String(userId));
    if (!brd) return res.status(404).json({ success: false, error: 'BRD not found' });

    const stmt = db.prepare(`
      SELECT 
        a.*,
        u.first_name as assigned_to_first_name,
        u.last_name as assigned_to_last_name,
        u.email as assigned_to_email
      FROM brd_review_assignments a
      LEFT JOIN users u ON a.assigned_to = u.id
      WHERE a.brd_id = ?
      ORDER BY a.assigned_at DESC
    `);

    const assignments = stmt.all(id);
    res.json({ success: true, data: assignments });
  } catch (error) {
    console.error('Error fetching review assignments:', error.message);
    res.status(500).json({ success: false, error: 'Failed to fetch review assignments' });
  }
};

/**
 * Add a collaborator to a BRD
 */
exports.addCollaborator = async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id, permission_level = 'view' } = req.body;
    const userId = req.user.id;

    // Check if BRD exists and belongs to user
    const brd = db.prepare(`SELECT * FROM brd_documents WHERE id = ? AND user_id = ?`).get(id, String(userId));
    if (!brd) return res.status(404).json({ success: false, error: 'BRD not found' });

    // Validate permission_level
    const validPermissions = ['view', 'comment', 'edit'];
    if (!validPermissions.includes(permission_level)) {
      return res.status(400).json({ success: false, error: 'Invalid permission level' });
    }

    // Add collaborator
    db.prepare(`
      INSERT INTO brd_collaborators (brd_id, user_id, permission_level, added_by, added_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(id, user_id, permission_level, userId);

    // Log to activity_logs
    try {
      const addedUser = db.prepare('SELECT email FROM users WHERE id = ?').get(user_id);
      db.prepare(`
        INSERT INTO activity_logs (user_id, action_type, description, resource_type, resource_id, created_at)
        VALUES (?, 'COLLABORATOR_ADDED', ?, 'brd_document', ?, CURRENT_TIMESTAMP)
      `).run(userId, `Added collaborator: ${addedUser?.email || user_id} (${permission_level})`, id);
    } catch (e) { console.error('Activity log error:', e); }

    // Send notification to added collaborator
    try {
      await notificationService.notify(user_id, 'COLLABORATOR_ASSIGNED', {
        actor_id: userId,
        actor_name: req.user.name || req.user.username,
        brd_title: brd.title,
        resource_id: id,
        resource_type: 'brd_document'
      });
    } catch (nErr) { console.error('Notification error:', nErr.message); }

    res.json({ success: true, message: 'Collaborator added successfully' });
  } catch (error) {
    console.error('Error adding collaborator:', error.message);
    if (error.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ success: false, error: 'User is already a collaborator' });
    }
    res.status(500).json({ success: false, error: 'Failed to add collaborator' });
  }
};

/**
 * Remove a collaborator from a BRD
 */
exports.removeCollaborator = async (req, res) => {
  try {
    const { id, collaboratorId } = req.params;
    const userId = req.user.id;

    // Check if BRD exists and belongs to user
    const brd = db.prepare(`SELECT * FROM brd_documents WHERE id = ? AND user_id = ?`).get(id, String(userId));
    if (!brd) return res.status(404).json({ success: false, error: 'BRD not found' });

    // Remove collaborator
    const stmt = db.prepare(`DELETE FROM brd_collaborators WHERE brd_id = ? AND id = ?`);
    const result = stmt.run(id, collaboratorId);

    if (result.changes === 0) {
      return res.status(404).json({ success: false, error: 'Collaborator not found' });
    }

    res.json({ success: true, message: 'Collaborator removed successfully' });
  } catch (error) {
    console.error('Error removing collaborator:', error.message);
    res.status(500).json({ success: false, error: 'Failed to remove collaborator' });
  }
};

/**
 * Get collaborators for a BRD
 */
exports.getCollaborators = (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userIdStr = String(userId);
    const userIdInt = Number(userId);

    // Verify access
    const brd = db.prepare(`
      SELECT b.id 
      FROM brd_documents b
      LEFT JOIN brd_collaborators c ON c.brd_id = b.id AND c.user_id = ?
      WHERE b.id = ? AND (b.user_id = ? OR b.assigned_to = ? OR c.user_id IS NOT NULL)
    `).get(userIdStr, id, userIdStr, userIdInt);

    if (!brd) return res.status(404).json({ success: false, error: 'BRD not found' });

    const stmt = db.prepare(`
      SELECT 
        c.id,
        c.brd_id,
        c.user_id,
        c.permission_level,
        c.added_at,
        COALESCE(u.first_name || ' ' || u.last_name, 'Unknown') as user_name,
        u.email
      FROM brd_collaborators c
      LEFT JOIN users u ON c.user_id = u.id
      WHERE c.brd_id = ?
      ORDER BY c.added_at DESC
    `);

    const collaborators = stmt.all(id);
    res.json({ success: true, data: collaborators });
  } catch (error) {
    console.error('Error fetching collaborators:', error.message);
    res.status(500).json({ success: false, error: 'Failed to fetch collaborators' });
  }
};

// ============ ACTIVITY LOG ENDPOINTS ============

/**
 * Get activity log for a BRD
 */
exports.getActivityLog = (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userIdStr = String(userId);
    const userIdInt = Number(userId);

    // Verify access
    const brd = db.prepare(`
      SELECT b.id 
      FROM brd_documents b
      LEFT JOIN brd_collaborators c ON c.brd_id = b.id AND c.user_id = ?
      WHERE b.id = ? AND (b.user_id = ? OR b.assigned_to = ? OR c.user_id IS NOT NULL)
    `).get(userIdStr, id, userIdStr, userIdInt);

    if (!brd) return res.status(404).json({ success: false, error: 'BRD not found' });

    // Get activity log from activity_logs table
    const stmt = db.prepare(`
      SELECT 
        a.id,
        a.resource_id as brd_id,
        a.action_type as to_status, -- Mapping for UI compatibility
        NULL as from_status,
        a.description as reason,
        a.created_at,
        COALESCE(u.first_name || ' ' || u.last_name, u.email) as user_name,
        u.email as user_email
      FROM activity_logs a
      LEFT JOIN users u ON a.user_id = u.id
      WHERE a.resource_id = ? AND a.resource_type = 'brd_document'
      ORDER BY a.created_at DESC
    `);

    const activities = stmt.all(id);

    res.json({ success: true, data: activities });
  } catch (error) {
    console.error('Error fetching activity log:', error.message);
    res.status(500).json({ success: false, error: 'Failed to fetch activity log' });
  }
};

/**
 * Log an activity (internal use)
 */
const logActivity = (brdId, fromStatus, toStatus, userId, reason) => {
  try {
    const stmt = db.prepare(`
      INSERT INTO brd_workflow_history (brd_id, from_status, to_status, changed_by, reason)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(brdId, fromStatus, toStatus, userId, reason);
  } catch (error) {
    console.error('Error logging activity:', error.message);
  }
};

exports.logActivity = logActivity;

/**
 * Get comments for a BRD
 */
exports.getComments = (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userIdStr = String(userId);
    const userIdInt = Number(userId);

    // Verify access
    const brd = db.prepare(`
      SELECT b.id 
      FROM brd_documents b
      LEFT JOIN brd_collaborators c ON c.brd_id = b.id AND c.user_id = ?
      WHERE b.id = ? AND (b.user_id = ? OR b.assigned_to = ? OR c.user_id IS NOT NULL)
    `).get(userIdStr, id, userIdStr, userIdInt);

    if (!brd) return res.status(404).json({ success: false, error: 'BRD not found' });

    const stmt = db.prepare(`
      SELECT 
        c.id,
        c.brd_id,
        c.section_heading as section_id,
        c.comment_text,
        c.status as is_resolved,
        c.created_at,
        c.updated_at,
        COALESCE(u.first_name || ' ' || u.last_name, 'Unknown') as user_name,
        u.email as user_email
      FROM brd_section_comments c
      LEFT JOIN users u ON c.commented_by = u.id
      WHERE c.brd_id = ?
      ORDER BY c.created_at DESC
    `);

    const comments = stmt.all(id);
    res.json({ success: true, data: comments });
  } catch (error) {
    console.error('Error fetching comments:', error.message);
    res.status(500).json({ success: false, error: 'Failed to fetch comments' });
  }
};

/**
 * Add a comment to a BRD section
 */
const addComment = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userIdStr = String(userId);
    const userIdInt = Number(userId);
    const { section_id, comment_text } = req.body;

    // Verify access
    const brd = db.prepare(`
      SELECT b.id 
      FROM brd_documents b
      LEFT JOIN brd_collaborators c ON c.brd_id = b.id AND c.user_id = ?
      WHERE b.id = ? AND (b.user_id = ? OR b.assigned_to = ? OR c.user_id IS NOT NULL)
    `).get(userIdStr, id, userIdStr, userIdInt);

    if (!brd) return res.status(404).json({ success: false, error: 'BRD not found' });

    if (!comment_text || !comment_text.trim()) {
      return res.status(400).json({ error: 'Comment text is required' });
    }

    // Ensure we use section_heading for the column
    const stmt = db.prepare(`
      INSERT INTO brd_section_comments (brd_id, section_heading, comment_text, commented_by, status)
      VALUES (?, ?, ?, ?, 'open')
    `);

    const info = stmt.run(id, section_id, comment_text.trim(), userId);

    // Log to activity_logs
    try {
      db.prepare(`
        INSERT INTO activity_logs (user_id, action_type, description, resource_type, resource_id, created_at)
        VALUES (?, 'COMMENT_ADDED', ?, 'brd_document', ?, CURRENT_TIMESTAMP)
      `).run(userId, `Added a comment in section: ${section_id}`, id);
    } catch (e) { console.error('Activity log error:', e); }

    // Send notification to BRD Owner (if the commenter is not the owner)
    try {
      if (userId !== Number(brd.user_id)) {
        await notificationService.notify(brd.user_id, 'COMMENT_ADDED', {
          actor_id: userId,
          actor_name: req.user.name || req.user.username,
          brd_title: brd.title,
          resource_id: id,
          resource_type: 'brd_document'
        });
      }
    } catch (nErr) { console.error('Notification error:', nErr.message); }

    // Return the newly created comment
    const comment = db.prepare(`
      SELECT 
        c.id,
        c.brd_id,
        c.section_heading as section_id,
        c.comment_text,
        c.status as is_resolved,
        c.created_at,
        COALESCE(u.first_name || ' ' || u.last_name, 'Unknown') as user_name,
        u.email as user_email
      FROM brd_section_comments c
      LEFT JOIN users u ON c.commented_by = u.id
      WHERE c.id = ?
    `).get(info.lastInsertRowid);

    res.json(comment);
  } catch (error) {
    console.error('Error adding comment:', error.message);
    res.status(500).json({ error: 'Failed to add comment' });
  }
};

/**
 * Update a comment
 */
const updateComment = (req, res) => {
  try {
    const { id, commentId } = req.params;
    const { comment_text, is_resolved } = req.body;
    const userId = req.user?.id;

    // Verify comment exists and user owns it
    const comment = db.prepare(`
      SELECT commented_by FROM brd_section_comments WHERE id = ? AND brd_id = ?
    `).get(commentId, id);

    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    if (comment.commented_by !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Update comment
    const updates = [];
    const values = [];

    if (comment_text !== undefined) {
      updates.push('comment_text = ?');
      values.push(comment_text);
    }
    if (is_resolved !== undefined) {
      updates.push('status = ?');
      values.push(is_resolved ? 'resolved' : 'open');
      if (is_resolved) {
        updates.push('resolved_at = CURRENT_TIMESTAMP');
        updates.push('resolved_by = ?');
        values.push(userId);
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(commentId);
    const stmt = db.prepare(`
      UPDATE brd_section_comments 
      SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `);
    stmt.run(...values);

    // Return updated comment
    const updated = db.prepare(`
      SELECT 
        c.id,
        c.brd_id,
        c.section_heading as section_id,
        c.comment_text,
        c.status,
        c.created_at,
        c.updated_at,
        u.first_name || ' ' || u.last_name as user_name,
        u.email as user_email
      FROM brd_section_comments c
      LEFT JOIN users u ON c.commented_by = u.id
      WHERE c.id = ?
    `).get(commentId);

    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('Error updating comment:', error.message);
    res.status(500).json({ error: 'Failed to update comment' });
  }
};

/**
 * Delete a comment
 */
const deleteComment = (req, res) => {
  try {
    const { id, commentId } = req.params;
    const userId = req.user?.id;

    // Verify comment exists and user owns it
    const comment = db.prepare(`
      SELECT commented_by FROM brd_section_comments WHERE id = ? AND brd_id = ?
    `).get(commentId, id);

    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    if (comment.commented_by !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Delete comment
    db.prepare('DELETE FROM brd_section_comments WHERE id = ?').run(commentId);

    res.json({ success: true, message: 'Comment deleted' });
  } catch (error) {
    console.error('Error deleting comment:', error.message);
    res.status(500).json({ error: 'Failed to delete comment' });
  }
};

exports.addComment = addComment;
exports.updateComment = updateComment;
exports.deleteComment = deleteComment;


