const pool = require('./src/db/connection');

async function test() {
    console.log('--- Testing Link ---');
    try {
        // Try to link a known BRD and Diagram (from sample earlier)
        const brdId = '94e6a284-c430-49a8-986d-ff84220142f7';
        const diagramId = 6;

        const res = await pool.query('INSERT INTO brd_diagrams (brd_id, diagram_id) VALUES ($1, $2)', [brdId, diagramId]);
        console.log('Link Success:', res);
    } catch (e) {
        console.log('Link Failed:', e.message);
    }

    console.log('\n--- Testing Save Stories ---');
    try {
        const userId = 16;
        const stories = [{ title: 'Test Story', description: 'Test Desc', priority: 'P2', acceptance_criteria: ['AC1'], estimated_points: 2 }];
        const groupId = null;

        for (const story of stories) {
            await pool.query(
                `INSERT INTO user_stories (
              user_id, title, description, acceptance_criteria, priority, status, 
              estimated_points, generated_by_ai, group_id, tags, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, 'draft', $6, 1, $7, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
                [
                    userId,
                    story.title,
                    story.description,
                    JSON.stringify(story.acceptance_criteria || []),
                    story.priority || 'P2',
                    story.estimated_points || null,
                    groupId,
                    JSON.stringify(['extracted-from-diagram'])
                ]
            );
        }
        console.log('Save Stories Success');
    } catch (e) {
        console.log('Save Stories Failed:', e.message);
    }
}

test().then(() => process.exit());
