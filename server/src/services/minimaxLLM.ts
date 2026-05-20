import axios from 'axios';
import { siliconflowService } from './siliconflow';
import { vectorDB } from './vectorDB';

const MINIMAX_API_KEY = 'your_key_input_here';
const MINIMAX_BASE_URL = 'https://api.minimaxi.com/v1';
const MINIMAX_MODEL = 'MiniMax-M2.7-highspeed';

export class MiniMaxService {
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = MINIMAX_API_KEY;
    this.baseUrl = MINIMAX_BASE_URL;
  }

  async retrieveRelevantChunks(caseId: string, queryStrings: string[]): Promise<string> {
    try {
      const allQueries = queryStrings.filter(q => q).join(' ');
      if (!allQueries.trim()) {
        const chunks = vectorDB.getCaseVectors(caseId);
        return chunks.slice(0, 10).map(function(c) { return c.text; }).join('\n\n---\n\n');
      }

      const queryEmbedding = await siliconflowService.getEmbeddings([allQueries]);
      
      if (queryEmbedding && queryEmbedding.length > 0) {
        const results = vectorDB.search(caseId, queryEmbedding[0], 15);
        return results.map(function(r) { return r.chunk.text; }).join('\n\n---\n\n');
      } else {
        const fallback = vectorDB.getCaseVectors(caseId);
        return fallback.slice(0, 10).map(function(c) { return c.text; }).join('\n\n---\n\n');
      }
    } catch (e) {
      console.error('[MiniMax RAG retrieve error', e);
      return '';
    }
  }

  async callMiniMaxChat(systemPrompt: string, userMessage: string): Promise<string> {
    try {
      console.log('[MiniMax] calling model=' + MINIMAX_MODEL);
      const startTime = Date.now();

      const response = await axios.post(
        this.baseUrl + '/chat/completions',
        {
          model: MINIMAX_MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage }
          ],
          temperature: 0.1,
          max_tokens: 2048
        },
        {
          headers: {
            'Authorization': 'Bearer ' + this.apiKey,
            'Content-Type': 'application/json'
          },
          timeout: 180000
        }
      );

      if (response.status === 200 && response.data) {
        console.log('[MiniMax success, time=' + (Date.now() - startTime) + 'ms');
        
        const choices = response.data.choices || [];
        if (choices.length > 0 && choices[0].message && choices[0].message.content) {
          return choices[0].message.content;
        }
        if (choices.length > 0 && choices[0].text) {
          return choices[0].text;
        }
        const reply = response.data.reply;
        if (typeof reply === 'string') return reply;
        if (Array.isArray(reply)) return reply.join('\n');
      }
      console.warn('[MiniMax] format error', JSON.stringify(response.data, null, 2));
      return '';
    } catch (err: any) {
      console.error('[MiniMax API ERROR]');
      if (err.response) {
        console.error('  status=', err.response.status);
        console.error('  data=', JSON.stringify(err.response.data, null, 2));
      } else {
        console.error('  error', err);
      }
      return '';
    }
  }

  async extractCaseName(rawDocuments: string): Promise<string> {
    const systemPrompt = '你是法律文书信息提取专家，只回答提取的内容，不要有多余描述。';
    const userMessage = `从以下投诉书内容中提取：投诉人的单位名称+要投诉的项目名称，不要有多余的其他描述。\n\n投诉书内容：\n${rawDocuments.substring(0, 2000)}`;
    
    const result = await this.callMiniMaxChat(systemPrompt, userMessage);
    return result.trim() || '待分析案件';
  }

  async extractCaseSummary(rawDocuments: string): Promise<string> {
    const systemPrompt = '你是法律文书信息提取专家，只回答提取的内容，不要有多余描述。';
    const userMessage = `从以下投诉书内容中提取：投诉人有几个投诉事项，对此次什么项目表示不满并投诉相关企业。不要有多余的其他描述。\n\n投诉书内容：\n${rawDocuments.substring(0, 2000)}`;
    
    const result = await this.callMiniMaxChat(systemPrompt, userMessage);
    return result.trim() || '待分析';
  }

  async extractFullCaseInfo(rawDocuments: string): Promise<any> {
    const systemPrompt = `你是法律文书信息提取专家，请从招标投诉案件文档中提取结构化信息。

返回JSON格式：
{
  "complainant": {
    "companyName": "投诉人公司全称",
    "address": "地址",
    "contact": "联系人"
  },
  "respondent": {
    "companyName": "被投诉人/代理机构公司全称",
    "address": "地址"
  },
  "projectInfo": {
    "projectName": "项目名称",
    "projectCode": "项目编号",
    "purchaser": "采购人",
    "agency": "采购代理机构",
    "winningBidder": "中标人"
  },
  "complaintItems": [
    {
      "title": "投诉事项标题",
      "content": "投诉事项内容",
      "legalBasis": "相关法律依据"
    }
  ]
}

注意：缺失字段填"待确认"，只用JSON。`;

    const userMessage = `请从以下文档提取案件要素：\n\n${rawDocuments.substring(0, 3000)}`;
    const llmOutput = await this.callMiniMaxChat(systemPrompt, userMessage);

    try {
      const firstJson = llmOutput.indexOf('{');
      const lastJson = llmOutput.lastIndexOf('}');
      
      if (firstJson >= 0 && lastJson >= 0) {
        const parseStr = llmOutput.substring(firstJson, lastJson + 1);
        return JSON.parse(parseStr);
      }
    } catch (e) {
      console.error('[LLM parse error]', e);
    }

    return {
      complainant: { companyName: '待确认', address: '', contact: '' },
      respondent: { companyName: '待确认', address: '' },
      projectInfo: { projectName: '', projectCode: '', biddingCompany: '', purchaser: '', agency: '' },
      complaintItems: []
    };
  }
}

export const miniMaxService = new MiniMaxService();
