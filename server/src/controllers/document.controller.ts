import { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { documentService, caseService } from '../services/jsonDB';
import { config } from '../config';

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
        documents: [...caseItem.documents, document._id],
        status: '处理中',
        progress: 20
      });
    }

    res.json({ message: '文件上传成功', document });
  } catch (error) {
    res.status(500).json({ message: '文件上传失败', error });
  }
};

export const getDocuments = async (req: Request, res: Response) => {
  try {
    const { caseId } = req.params;
    const documents = documentService.find({ caseId });
    res.json(documents);
  } catch (error) {
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

    const mockOcrContent = `这是文档 "${document.fileName}" 的OCR识别内容示例。

根据文档内容分析：
1. 投诉企业：xxx技术股份有限公司
2. 被投诉企业：xxx设计院有限公司
3. 采购项目：xxx开发项目
4. 项目编号：GPDXXX-XX23-AXXXXX62
5. 中标企业：xxx技术股份有限公司

投诉事项摘要：
- 投诉事项1：关于中标方企业资质问题的投诉
- 投诉事项2：关于招标流程合规性的质疑

以上内容为模拟OCR识别结果。`;

    documentService.findByIdAndUpdate(documentId, { ocrContent: mockOcrContent });

    const caseItem = caseService.findById(document.caseId);
    if (caseItem) {
      caseService.findByIdAndUpdate(document.caseId, { progress: 50 });
    }

    res.json({ message: 'OCR识别完成', content: mockOcrContent });
  } catch (error) {
    res.status(500).json({ message: 'OCR识别失败', error });
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
    const allContent = documents.map(d => d.ocrContent).join('\n\n');

    const mockAnalysis = {
      elements: {
        complainant: {
          companyName: 'xxx技术股份有限公司',
          address: 'xx市xx区xx街道xx社区xx号',
          complaintDate: '2025年02月20日',
          hasProtested: '已质疑'
        },
        respondent: {
          companyName: 'xxx设计院有限公司',
          address: 'xx市xx区xx街道xx社区xx号'
        }
      },
      facts: {
        projectName: 'xxx开发项目',
        projectCode: 'GPDXXX-XX23-AXXXXX62',
        biddingCompany: 'xxx技术股份有限公司',
        purchaser: 'xxx学院/医院',
        agency: 'xxx设计院有限公司'
      },
      complaintItems: [
        {
          title: '投诉事项1',
          content: '本项目公示的中标方广东恒电信息科技股份有限公司参与本项目中响应"提供的货物全部由符合政策要求的中小企业制造"，提出"广东恒电信息科技股份有限公司"为"小型企业"，从人员103人，营业收入为15735.28万元。通过企业工商注册信息查询，该企业属于"软件和信息技术服务业"，依据国家统计局《统计上大中小微型企业划分办法(2017)》的通知，中型企业标准为从业人员(X)满足100人<X<300人且营业收入(Y)满足1000万元<Y<10000万元，根据该企业提供的从业人员和营业收入信息，该企业属于"中型企业"不符合"小型企业"划分，对此该企业用"小型企业"虚假响应本标书要求获取价格扣除提出投诉。',
          legalBasis: '1.本标书中明确要求:投标人应当对其出具的《中小企业声明函》真实性负责，投标人出具《中小企业声明函》内容不实的，属于提供虚假材料谋取中标。2.招标投标法实施条例，第五十一条，看下列情形之一的，评标委员会应当否决其投标:第(七)条投标人弄虚作假行贿等违法行为。'
        },
        {
          title: '投诉事项2',
          content: '本项目于2024-09-14公示结果后，我方在9月14日对项目结果提出质疑，采购人/代理机构于2024年9月23日邮件回复，在答复的材料中，提供的证明材料不具备任何公信力。提供的是自测条件，自述行业，不是官方认定的行业属性和中小企业认定结果。广东恒电信息科技股份有限公司注册行业是软件和信息技术服务业，自测却选择工业企业自测，明显存在故意规避标准政策要求。',
          legalBasis: '1.本标书中明确要求:投标人应当对其出具的《中小企业声明函》真实性负责，投标人出具《中小企业声明函》内容不实的，属于提供虚假材料谋取中标。'
        }
      ],
      suggestions: '根据以上分析，建议：1. 核实中标企业的真实资质情况；2. 审查招标流程是否合规；3. 根据相关法律法规作出处理决定。'
    };

    caseService.findByIdAndUpdate(caseId, {
      analysisResult: mockAnalysis,
      complainant: mockAnalysis.elements.complainant,
      respondent: mockAnalysis.elements.respondent,
      projectInfo: mockAnalysis.facts,
      complaintItems: mockAnalysis.complaintItems,
      summary: mockAnalysis.suggestions.substring(0, 100) + '...',
      progress: 100,
      status: '已完成'
    });

    res.json({ message: 'AI分析完成', result: mockAnalysis });
  } catch (error) {
    res.status(500).json({ message: 'AI分析失败', error });
  }
};