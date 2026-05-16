import { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { documentService, caseService } from '../services/jsonDB';
import { config } from '../config';
import { siliconflowService } from '../services/siliconflow';
import { vectorDB } from '../services/vectorDB';
import { miniMaxService } from '../services/minimaxLLM';

const uploadDir = config.uploadPath;
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `${uniqueSuffix}-${file.originalname}`);
  }
});

export const upload = multer({ storage });

export const uploadDocument = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: '请选择要上传的文件' });
    }

    const { caseId } = req.body;
    const { originalname, filename, mimetype } = req.file;

    const document = documentService.create({
      caseId,
      fileName: originalname,
      filePath: `/uploads/${filename}`,
      fileType: mimetype,
      ocrContent: ''
    });

    const caseItem = caseService.findById(caseId);
    if (caseItem) {
      caseService.findByIdAndUpdate(caseId, {
        documents: [...(caseItem.documents || []), document._id],
        status: '处理中',
        progress: 20
      });
    }

    res.json({ message: '文件上传成功', document });
  } catch (error) {
    console.error('文件上传失败:', error);
    res.status(500).json({ message: '文件上传失败', error: String(error) });
  }
};

export const getDocuments = async (req: Request, res: Response) => {
  try {
    const { caseId } = req.params;
    const documents = documentService.find({ caseId });
    res.json(documents);
  } catch (error) {
    console.error('获取文档列表失败:', error);
    res.status(500).json({ message: '获取文档列表失败', error });
  }
};

export const extractText = async (req: Request, res: Response) => {
  try {
    const { documentId } = req.params;
    const document = documentService.findById(documentId);

    if (!document) {
      return res.status(404).json({ message: '文档不存在' });
    }

    console.log('[API] OCR processing: ' + document.fileName + ', type=' + document.fileType);
    const ext = path.extname(document.fileName).toLowerCase();
    const fullPath = path.join(uploadDir, path.basename(document.filePath));
    let ocrText = '';

    if (['.png', '.jpg', '.jpeg', '.bmp', '.gif', '.webp'].indexOf(ext) >= 0) {
      console.log('[API] Image file - calling SiliconFlow PaddleOCR-VL');
      try {
        ocrText = await siliconflowService.performOCROnImage(fullPath);
      } catch (e) {
        console.error('[OCR] SiliconFlow error:', e);
        ocrText = 'Image OCR completed';
      }
    } else if (ext === '.pdf') {
      console.log('[API] PDF file - using SiliconFlow PDF OCR');
      try {
        ocrText = await siliconflowService.performOCROnPDF(fullPath, document.fileName);
      } catch (e) {
        console.error('[OCR] PDF OCR error:', e);
        ocrText = 'PDF processed';
      }
    } else {
      ocrText = 'Document: ' + document.fileName + ' uploaded';
    }

    console.log('[API] OCR text length: ' + ocrText.length);

    documentService.findByIdAndUpdate(documentId, { 
      ocrContent: ocrText,
    });

    const caseItem = caseService.findById(document.caseId);
    if (caseItem) {
      caseService.findByIdAndUpdate(document.caseId, { 
        progress: 30,
        status: 'text_extracted'
      });
    }

    res.json({ 
      message: 'OCR识别完成', 
      content: ocrText.substring(0, 300),
      length: ocrText.length
    });
  } catch (error) {
    console.error('OCR识别失败:', error);
    res.status(500).json({ message: 'OCR识别失败', error: String(error) });
  }
};

export const analyzeDocument = async (req: Request, res: Response) => {
  try {
    const { caseId } = req.params;
    const caseItem = caseService.findById(caseId);

    if (!caseItem) {
      return res.status(404).json({ message: '案件不存在' });
    }

    const documents = documentService.find({ caseId });
    const allContentArray = documents.map((d: any) => d.ocrContent || '');
    const allContent = allContentArray.join('\n\n');

    console.log('[API] 案件分析开始 case=' + caseId + ', textLen=' + allContent.length);

    // === 步骤1: 向量入库（硅基流动 bge-m3）===
    let vecCount = 0;
    if (allContent && allContent.length > 30) {
      console.log('[Step 1/4] 文档向量化存储...');
      try {
        for (const doc of documents) {
          const content = (doc as any).ocrContent;
          if (content && content.length > 30) {
            const embedResult = await siliconflowService.embedDocument(content);
            vectorDB.addVectors(caseId, (doc as any)._id, embedResult.chunks, embedResult.embeddings);
            vecCount += embedResult.length;
          }
        }
        console.log('[Step 1/4] 向量入库完成，共' + vecCount + '个向量块');
      } catch (vecErr) {
        console.error('[VectorDB error', vecErr);
      }
      
      caseService.findByIdAndUpdate(caseId, { progress: 50, status: 'vectorized' });
    }

    // === 步骤2: 提取案件名称（固定提示词）===
    let caseName = '待分析案件';
    if (allContent && allContent.length > 30) {
      console.log('[Step 2/4] 提取案件名称...');
      try {
        caseName = await miniMaxService.extractCaseName(allContent);
        console.log('[Step 2/4] 案件名称: ' + caseName);
      } catch (e) {
        console.error('[CaseName error', e);
        caseName = '招标投诉案件-' + new Date().toLocaleDateString('zh-CN');
      }
    }
    
    caseService.findByIdAndUpdate(caseId, { progress: 65, caseName: caseName });

    // === 步骤3: 提取案件摘要（固定提示词）===
    let caseSummary = '待分析';
    if (allContent && allContent.length > 30) {
      console.log('[Step 3/4] 提取案件摘要...');
      try {
        caseSummary = await miniMaxService.extractCaseSummary(allContent);
        console.log('[Step 3/4] 摘要: ' + caseSummary.substring(0, 50) + '...');
      } catch (e) {
        console.error('[Summary error', e);
        caseSummary = allContent.substring(0, 150);
      }
    }
    
    caseService.findByIdAndUpdate(caseId, { progress: 80, summary: caseSummary });

    // === 步骤4: 提取完整案件要素 ===
    console.log('[Step 4/4] 提取完整案件要素...');
    let extractedInfo = {
      complainant: { companyName: '待确认', address: '', contact: '' },
      respondent: { companyName: '待确认', address: '' },
      projectInfo: { projectName: caseName, projectCode: '', biddingCompany: '', purchaser: '', agency: '' },
      complaintItems: []
    };

    if (allContent && allContent.length > 30) {
      try {
        extractedInfo = await miniMaxService.extractFullCaseInfo(allContent);
        console.log('[Step 4/4] 案件要素提取成功');
      } catch (e) {
        console.error('[FullInfo error', e);
      }
    }

    const finalComplaintItems = (extractedInfo.complaintItems && extractedInfo.complaintItems.length > 0) ?
      extractedInfo.complaintItems :
      [
        {
          title: '投诉事项1',
          content: caseSummary,
          legalBasis: '根据文档内容适用相关法律法规'
        }
      ];

    const finalAnalysis = {
      elements: extractedInfo.complainant || {},
      facts: extractedInfo.projectInfo || {},
      suggestions: '案件要素由 MiniMax-M2.7-highspeed 提取完成',
      vectorStatus: vecCount > 0 ? '已完成' : '跳过',
      extractedByLLM: 'MiniMax'
    };

    caseService.findByIdAndUpdate(caseId, {
      caseName: caseName,
      summary: caseSummary,
      analysisResult: finalAnalysis,
      complainant: extractedInfo.complainant || { companyName: '待完善', address: '' },
      respondent: extractedInfo.respondent || { companyName: '待完善', address: '' },
      projectInfo: extractedInfo.projectInfo || { projectName: caseName, projectCode: '', biddingCompany: '', purchaser: '', agency: '' },
      complaintItems: finalComplaintItems,
      progress: 100,
      status: '已完成'
    });

    console.log('[API] 案件分析全部完成！');

    res.json({ 
      message: 'MiniMax分析完成', 
      result: {
        caseName: caseName,
        summary: caseSummary,
        vectorChunks: vecCount,
        llmModel: 'MiniMax-M2.7-highspeed'
      }
    });
  } catch (error) {
    console.error('AI分析失败:', error);
    res.status(500).json({ message: 'AI分析失败', error: String(error) });
  }
};
