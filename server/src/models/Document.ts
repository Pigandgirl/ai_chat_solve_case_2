import mongoose, { Schema, Document, ObjectId } from 'mongoose';

export interface IDocument extends Document {
  caseId: ObjectId;
  fileName: string;
  filePath: string;
  fileType: string;
  ocrContent: string;
  uploadedAt: Date;
}

const DocumentSchema: Schema = new Schema({
  caseId: { type: Schema.Types.ObjectId, ref: 'Case', required: true },
  fileName: { type: String, required: true },
  filePath: { type: String, required: true },
  fileType: { type: String, required: true },
  ocrContent: { type: String, default: '' },
}, { timestamps: { createdAt: 'uploadedAt' } });

export default mongoose.model<IDocument>('Document', DocumentSchema);