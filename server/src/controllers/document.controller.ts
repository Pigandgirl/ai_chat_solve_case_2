import { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { documentService, caseService } from '../services/jsonDB';
import { config } from '../config';
import { OCRService } from '../services/ocrService';

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

    console.log(`Starting OCR processing for document: ${document.fileName}`);
    
    const ocrText = await OCRService.processDocument(document.filePath, document.fileName);
    
    console.log(`OCR completed, extracted ${ocrText.length} characters`);

    documentService.findByIdAndUpdate(documentId, { 
      ocrContent: ocrText,
    });

    const caseItem = caseService.findById(document.caseId);
    if (caseItem) {
      caseService.findByIdAndUpdate(document.caseId, { 
        progress: 50,
        status: 'text_extracted'
      });
    }

    res.json({ 
      message: 'OCR识别完成', 
      content: ocrText.substring(0, 200) + (ocrText.length > 200 ? '...' : ''),
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

    console.log(`Analyzing case ${caseId}, total text length: ${allContent.length}`);

    let caseName = caseItem.caseName || '待分析案件';
    let extractedInfo: any = {};

    if (allContent && allContent.length > 50) {
      const contentLower = allContent.toLowerCase();
      
      const companyPatterns = [
        /(?:投诉|质疑)[人单位]*[:：\s]+([^\n，。；]{3,40})/g,
        /(?:原告|申诉人|异议人)[:：\s]+([^\n，。；]{3,40})/g
      ];
      
      for (const pattern of companyPatterns) {
        const match = pattern.exec(allContent);
        if (match && match[1]) {
          const cleanName = match[1].trim().replace(/[的了和及与]$/, '');
          if (cleanName.length > 2) {
            caseName = cleanName.substring(0, 30);
            break;
          }
        }
      }

      const complainantMatch = allContent.match(/投诉人[:：\s]*([^\n\r，。；]{5,})/);
      const respondentMatch = allContent.match(/被投诉人[:：\s]*([^\n\r，。；]{5,})|代理机构[:：\s]*([^\n\r，。；]{5,})/);
      const projectMatch = allContent.match(/项目名称[:：\s]*([^\n\r，。；]{4,})|采购项目[:：\s]*([^\n\r，。；]{4,})/);
      const numberMatch = allContent.match(/(?:项目|招标|采购)(?:编号|单号|号次)[:：\s]*([A-Z0-9-]{6,})/);

      extractedInfo = {
        complainant: {
          companyName: complainantMatch ? complainantMatch[1].trim() : (documents.length > 0 ? '已识别企业' : '待识别'),
          address: '详见文档内容',
          complaintDate: new Date().toISOString().split('T')[0].replace(/-/g, '年').replace(/T/, '月') + '日',
          hasProtested: '已质疑'
        },
        respondent: {
          companyName: respondentMatch ? (respondentMatch[1] || respondentMatch[2] || '待确认').trim() : '待识别',
          address: '详见文档内容'
        },
        projectInfo: {
          projectName: projectMatch ? (projectMatch[1] || projectMatch[2] || caseName).trim() : caseName,
          projectCode: numberMatch ? numberMatch[1].trim() : 'AUTO-' + Date.now(),
          biddingCompany: '待确认',
          purchaser: '待确认',
          agency: '待确认'
        }
      };
    } else {
      caseName = '招标投诉案件-' + new Date().toLocaleDateString('zh-CN');
    }

    const complaintItemsArray = [
      {
        title: '投诉事项1',
        content: allContent && allContent.length > 100 
          ? allContent.substring(0, 400) + '\n\n（文档后续内容已在系统中存储，可在案件办理时查看。）'
          : '文档内容分析中，请在案件办理界面查看详细信息。',
        legalBasis: '根据《招标投标法》、《政府采购法》及相关实施条例，结合文档内容进一步分析。'
      }
    ];

    const mockAnalysis = {
      elements: extractedInfo.complainant || {},
      facts: extractedInfo.projectInfo || {},
      suggestions: '系统已完成文档文本提取。请进入"办理"界面查看完整内容。',
      extractedInfo
    };

    caseService.findByIdAndUpdate(caseId, {
      caseName: caseName,
      analysisResult: mockAnalysis,
      complainant: extractedInfo.complainant || { companyName: '待完善', address: '' },
      respondent: extractedInfo.respondent || { companyName: '待完善', address: '' },
      projectInfo: extractedInfo.projectInfo || { projectName: caseName, projectCode: '', biddingCompany: '', purchaser: '', agency: '' },
      complaintItems: complaintItemsArray,
      summary: allContent && allContent.length > 50 ? allContent.substring(0, 80) + '...' : '案件已上传，待进一步分析。',
      progress: 100,
      status: '已完成'
    });

    res.json({ 
      message: 'AI分析完成', 
      result: {
        caseName,
        textLength: allContent.length,
        documentsAnalyzed: documents.length
      }
    });
  } catch (error) {
    console.error('AI分析失败:', error);
    res.status(500).json({ message: 'AI分析失败', error: String(error) });
  }
};
