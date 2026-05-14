import { Router } from 'express';
import { register, login, getCurrentUser } from '../controllers/auth.controller';
import { getCases, getCaseById, createCase, updateCase, deleteCase } from '../controllers/case.controller';
import { upload, uploadDocument, getDocuments, extractText, analyzeDocument } from '../controllers/document.controller';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.post('/auth/register', register);
router.post('/auth/login', login);
router.get('/auth/me', authMiddleware, getCurrentUser);

router.get('/cases', authMiddleware, getCases);
router.get('/cases/:id', authMiddleware, getCaseById);
router.post('/cases', authMiddleware, createCase);
router.put('/cases/:id', authMiddleware, updateCase);
router.delete('/cases/:id', authMiddleware, deleteCase);

router.post('/documents/upload', authMiddleware, upload.single('file'), uploadDocument);
router.get('/documents/:caseId', authMiddleware, getDocuments);
router.post('/documents/:documentId/ocr', authMiddleware, extractText);
router.post('/documents/analyze/:caseId', authMiddleware, analyzeDocument);

export default router;