import mongoose, { Schema, Document, ObjectId } from 'mongoose';

export interface ICase extends Document {
  caseName: string;
  caseType: string;
  status: string;
  progress: number;
  summary: string;
  complainant: {
    companyName: string;
    address: string;
  };
  respondent: {
    companyName: string;
    address: string;
  };
  projectInfo: {
    projectName: string;
    projectCode: string;
    biddingCompany: string;
    purchaser: string;
    agency: string;
  };
  complaintItems: Array<{
    title: string;
    content: string;
    legalBasis: string;
  }>;
  analysisResult: {
    elements: object;
    facts: object;
    suggestions: string;
  };
  documents: ObjectId[];
  userId: ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const CaseSchema: Schema = new Schema({
  caseName: { type: String, required: true },
  caseType: { type: String, required: true, enum: ['招标投诉', '招标审查'] },
  status: { type: String, required: true, enum: ['待处理', '处理中', '已完成'], default: '待处理' },
  progress: { type: Number, default: 0 },
  summary: { type: String, default: '' },
  complainant: {
    companyName: { type: String, default: '' },
    address: { type: String, default: '' },
  },
  respondent: {
    companyName: { type: String, default: '' },
    address: { type: String, default: '' },
  },
  projectInfo: {
    projectName: { type: String, default: '' },
    projectCode: { type: String, default: '' },
    biddingCompany: { type: String, default: '' },
    purchaser: { type: String, default: '' },
    agency: { type: String, default: '' },
  },
  complaintItems: [{
    title: { type: String },
    content: { type: String },
    legalBasis: { type: String },
  }],
  analysisResult: {
    elements: { type: Object, default: {} },
    facts: { type: Object, default: {} },
    suggestions: { type: String, default: '' },
  },
  documents: [{ type: Schema.Types.ObjectId, ref: 'Document' }],
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

export default mongoose.model<ICase>('Case', CaseSchema);