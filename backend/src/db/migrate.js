const pool = require('./connection');
const { flattenRolePermissions } = require('../utils/permissionChecker');

const migrate = async () => {
  const client = await pool.connect();
  try {
    console.log('Starting database migration...');

    // Users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE,
        username VARCHAR(255) UNIQUE,
        mobile VARCHAR(20) UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        role VARCHAR(50) DEFAULT 'analyst',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // User Stories table
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_stories (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        title VARCHAR(255) NOT NULL,
        description TEXT,
        acceptance_criteria TEXT,
        priority VARCHAR(50),
        status VARCHAR(50) DEFAULT 'draft',
        tags TEXT[],
        azure_devops_id VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // BRDs table
    await client.query(`
      CREATE TABLE IF NOT EXISTS brds (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        title VARCHAR(255) NOT NULL,
        content TEXT,
        version INTEGER DEFAULT 1,
        status VARCHAR(50) DEFAULT 'draft',
        file_path VARCHAR(255),
        file_type VARCHAR(50),
        generated_from_user_story_id INTEGER REFERENCES user_stories(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // BRD Comments table
    await client.query(`
      CREATE TABLE IF NOT EXISTS brd_comments (
        id SERIAL PRIMARY KEY,
        brd_id INTEGER NOT NULL REFERENCES brds(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id),
        comment TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Templates table
    await client.query(`
      CREATE TABLE IF NOT EXISTS templates (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        name VARCHAR(255) NOT NULL,
        description TEXT,
        content TEXT,
        template_type VARCHAR(100),
        is_public BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Documents table
    await client.query(`
      CREATE TABLE IF NOT EXISTS documents (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        title VARCHAR(255) NOT NULL,
        description TEXT,
        file_path VARCHAR(255) NOT NULL,
        file_type VARCHAR(50),
        file_size INTEGER,
        tags TEXT[],
        access_level VARCHAR(50) DEFAULT 'private',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Diagrams table
    await client.query(`
      CREATE TABLE IF NOT EXISTS diagrams (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        title VARCHAR(255) NOT NULL,
        description TEXT,
        diagram_data TEXT,
        diagram_type VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Reports table
    await client.query(`
      CREATE TABLE IF NOT EXISTS reports (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        title VARCHAR(255) NOT NULL,
        report_type VARCHAR(100),
        report_data TEXT,
        generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        exported_format VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // AI Configurations table
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_configurations (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        prompt_template TEXT,
        language VARCHAR(50) DEFAULT 'en',
        detail_level VARCHAR(50) DEFAULT 'medium',
        temperature DECIMAL(2,2) DEFAULT 0.7,
        max_tokens INTEGER DEFAULT 2000,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Azure DevOps Integrations table
    await client.query(`
      CREATE TABLE IF NOT EXISTS azure_devops_integrations (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        organization VARCHAR(255) NOT NULL,
        project VARCHAR(255) NOT NULL,
        pat_token_hash VARCHAR(255) NOT NULL,
        is_active BOOLEAN DEFAULT true,
        last_synced TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Audit Logs table
    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        action VARCHAR(255) NOT NULL,
        entity_type VARCHAR(100),
        entity_id INTEGER,
        old_values TEXT,
        new_values TEXT,
        ip_address VARCHAR(50),
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Password Reset Tokens table
    await client.query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token VARCHAR(255) NOT NULL UNIQUE,
        expires_at TIMESTAMP NOT NULL,
        used_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Permissions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS permissions (
        id SERIAL PRIMARY KEY,
        role VARCHAR(50) NOT NULL,
        action VARCHAR(100) NOT NULL,
        resource VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(role, action, resource)
      )
    `);

    const permissionRows = flattenRolePermissions();
    for (const perm of permissionRows) {
      await client.query(
        `INSERT INTO permissions (role, action, resource)
         VALUES ($1, $2, $3)
         ON CONFLICT (role, action, resource) DO NOTHING`,
        [perm.role, perm.action, perm.resource]
      );
    }

    console.log('Database migration completed successfully');
  } catch (err) {
    console.error('Migration error:', err);
    throw err;
  } finally {
    client.release();
    pool.end();
  }
};

migrate().catch(console.error);
