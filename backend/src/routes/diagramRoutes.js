const express = require('express');
const router = express.Router();
const diagramController = require('../controllers/diagramController');
const authMiddleware = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/permissionMiddleware');

router.use(authMiddleware);

// AI Generation
router.post('/generate', requirePermission('diagrams', 'create'), diagramController.generateDiagram);

// CRUD
router.get('/', requirePermission('diagrams', 'read'), diagramController.getDiagrams);
router.get('/:id', requirePermission('diagrams', 'read'), diagramController.getDiagramById);
router.post('/', requirePermission('diagrams', 'create'), diagramController.saveDiagram);
router.delete('/:id', requirePermission('diagrams', 'delete'), diagramController.deleteDiagram);

// AI Extraction
router.post('/:id/extract-stories', requirePermission('diagrams', 'update'), diagramController.extractStories);
router.post('/:id/save-stories', requirePermission('diagrams', 'update'), diagramController.saveStories);

// Linking
router.get('/brd/:brdId', requirePermission('diagrams', 'read'), diagramController.getBrdDiagrams);
router.post('/link', requirePermission('diagrams', 'update'), diagramController.linkToBrd);

module.exports = router;
