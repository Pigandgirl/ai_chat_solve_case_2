import fs from 'fs';
import path from 'path';
import { User, CaseItem, DocumentItem } from '../types';

const DB_DIR = path.join(__dirname, '../../data');
const USERS_FILE = path.join(DB_DIR, 'users.json');
const CASES_FILE = path.join(DB_DIR, 'cases.json');
const DOCUMENTS_FILE = path.join(DB_DIR, 'documents.json');

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const readFile = <T>(filePath: string, defaultValue: T): T => {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error);
  }
  return defaultValue;
};

const writeFile = <T>(filePath: string, data: T): void => {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.error(`Error writing ${filePath}:`, error);
  }
};

let users: User[] = readFile<User[]>(USERS_FILE, []);
let cases: CaseItem[] = readFile<CaseItem[]>(CASES_FILE, []);
let documents: DocumentItem[] = readFile<DocumentItem[]>(DOCUMENTS_FILE, []);

const persistUsers = () => writeFile(USERS_FILE, users);
const persistCases = () => writeFile(CASES_FILE, cases);
const persistDocuments = () => writeFile(DOCUMENTS_FILE, documents);

let userIdCounter = users.length > 0 
  ? Math.max(...users.map(u => parseInt(u._id.replace('user_', '')) || 0)) + 1 
  : 1;
let caseIdCounter = cases.length > 0 
  ? Math.max(...cases.map(c => parseInt(c._id.replace('case_', '')) || 0)) + 1 
  : 1;
let documentIdCounter = documents.length > 0 
  ? Math.max(...documents.map(d => parseInt(d._id.replace('doc_', '')) || 0)) + 1 
  : 1;

export const initJSONData = () => {
  if (users.length === 0) {
    const defaultAdmin: User = {
      _id: 'user_0',
      username: 'admin',
      password: '$2a$10$Ng2ib.sM9Iku4jXWWbtLLu5emXsv1Z536KifSCa34GlWKelqjZ.36',
      phone: '13800138000',
      email: 'admin@example.com',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    users.push(defaultAdmin);
    userIdCounter = 1;
    persistUsers();
  }

  if (cases.length === 0) {
    const defaultCase: CaseItem = {
      _id: 'case_0',
      caseName: '肇庆学院教学楼智慧课室改造项目',
      caseType: '招标投诉',
      status: '已完成',
      progress: 100,
      summary: '根据以上分析，建议：1. 核实中标企业的真实资质情况；2. 审查招标流程是否合规；3. 根据相关法律法规作出处理决定。',
      complainant: {
        companyName: 'xxx技术股份有限公司',
        address: 'xx市xx区xx街道xx社区xx号',
        complaintDate: '2025年02月20日',
        hasProtested: '已质疑'
      },
      respondent: {
        companyName: 'xxx设计院有限公司',
        address: 'xx市xx区xx街道xx社区xx号'
      },
      projectInfo: {
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
      analysisResult: {
        elements: {},
        facts: {},
        suggestions: '根据以上分析，建议：1. 核实中标企业的真实资质情况；2. 审查招标流程是否合规；3. 根据相关法律法规作出处理决定。'
      },
      documents: [],
      userId: 'user_0',
      createdAt: new Date('2024-05-10T12:00:00'),
      updatedAt: new Date()
    };
    cases.push(defaultCase);
    caseIdCounter = 1;
    persistCases();
  }
};

export const userService = {
  findOne: (query: { username?: string; phone?: string }) => {
    return users.find(u => 
      (query.username && u.username === query.username) ||
      (query.phone && u.phone === query.phone)
    ) || null;
  },
  
  create: (userData: Omit<User, '_id' | 'createdAt' | 'updatedAt'>) => {
    const user: User = {
      ...userData,
      _id: `user_${userIdCounter++}`,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    users.push(user);
    persistUsers();
    return user;
  },
  
  findById: (id: string) => {
    return users.find(u => u._id === id) || null;
  }
};

export const caseService = {
  find: (query: { userId?: string; caseName?: string }) => {
    let result = cases.filter(c => c.userId === query.userId);
    if (query.caseName !== undefined) {
      result = result.filter(c => c.caseName.includes(query.caseName as string));
    }
    return result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },
  
  findById: (id: string) => {
    const caseItem = cases.find(c => c._id === id);
    if (!caseItem) return null;
    const docList = documents.filter(d => d.caseId === id);
    return { ...caseItem, documentList: docList };
  },
  
  create: (caseData: Omit<CaseItem, '_id' | 'createdAt' | 'updatedAt'>) => {
    const caseItem: CaseItem = {
      ...caseData,
      _id: `case_${caseIdCounter++}`,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    cases.push(caseItem);
    persistCases();
    return caseItem;
  },
  
  findByIdAndUpdate: (id: string, updateData: Partial<CaseItem>) => {
    const index = cases.findIndex(c => c._id === id);
    if (index !== -1) {
      cases[index] = { ...cases[index], ...updateData, updatedAt: new Date() };
      persistCases();
      return cases[index];
    }
    return null;
  },
  
  findByIdAndDelete: (id: string) => {
    const index = cases.findIndex(c => c._id === id);
    if (index !== -1) {
      const deleted = cases[index];
      cases.splice(index, 1);
      persistCases();
      return deleted;
    }
    return null;
  }
};

export const documentService = {
  create: (docData: Omit<DocumentItem, '_id' | 'uploadedAt'>) => {
    const document: DocumentItem = {
      ...docData,
      _id: `doc_${documentIdCounter++}`,
      uploadedAt: new Date()
    };
    documents.push(document);
    persistDocuments();
    return document;
  },
  
  find: (query: { caseId: string }) => {
    return documents.filter(d => d.caseId === query.caseId);
  },
  
  findById: (id: string) => {
    return documents.find(d => d._id === id) || null;
  },
  
  findByIdAndUpdate: (id: string, updateData: Partial<DocumentItem>) => {
    const index = documents.findIndex(d => d._id === id);
    if (index !== -1) {
      documents[index] = { ...documents[index], ...updateData };
      persistDocuments();
      return documents[index];
    }
    return null;
  }
};