import { Request, Response } from 'express';
import { caseService } from '../services/jsonDB';

export const getCases = async (req: Request, res: Response) => {
  try {
    const { caseName, keywords, caseType, startDate, endDate } = req.query;
    const userId = req.user._id;

    let result = caseService.find({ userId });

    if (caseName) {
      result = result.filter(c => c.caseName.includes(caseName as string));
    }

    if (keywords) {
      result = result.filter(c => 
        c.caseName.includes(keywords as string) || 
        (c.summary && c.summary.includes(keywords as string))
      );
    }

    if (caseType) {
      result = result.filter(c => c.caseType === caseType);
    }

    if (startDate && typeof startDate === 'string') {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      result = result.filter(c => new Date(c.createdAt) >= start);
    }

    if (endDate && typeof endDate === 'string') {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      result = result.filter(c => new Date(c.createdAt) <= end);
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ message: '获取案件列表失败', error });
  }
};

export const getCaseById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const caseItem = caseService.findById(id);
    
    if (!caseItem) {
      return res.status(404).json({ message: '案件不存在' });
    }

    res.json(caseItem);
  } catch (error) {
    res.status(500).json({ message: '获取案件详情失败', error });
  }
};

export const createCase = async (req: Request, res: Response) => {
  try {
    const { caseName, caseType, summary } = req.body;
    const userId = req.user._id;

    const caseItem = caseService.create({
      caseName: caseName || '待分析案件',
      caseType,
      summary: summary || '',
      userId,
      status: '待处理',
      progress: 0,
      complainant: { companyName: '', address: '' },
      respondent: { companyName: '', address: '' },
      projectInfo: { projectName: '', projectCode: '', biddingCompany: '', purchaser: '', agency: '' },
      complaintItems: [],
      analysisResult: { elements: {}, facts: {}, suggestions: '' },
      documents: []
    });

    res.status(201).json({ message: '案件创建成功', case: caseItem });
  } catch (error) {
    res.status(500).json({ message: '创建案件失败', error });
  }
};

export const updateCase = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const caseItem = caseService.findByIdAndUpdate(id, updateData);
    
    if (!caseItem) {
      return res.status(404).json({ message: '案件不存在' });
    }

    res.json({ message: '案件更新成功', case: caseItem });
  } catch (error) {
    res.status(500).json({ message: '更新案件失败', error });
  }
};

export const deleteCase = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const caseItem = caseService.findByIdAndDelete(id);
    
    if (!caseItem) {
      return res.status(404).json({ message: '案件不存在' });
    }

    res.json({ message: '案件删除成功' });
  } catch (error) {
    res.status(500).json({ message: '删除案件失败', error });
  }
};